# Task Context — Hidratação do Ledger no `confirmBalance`

## Contexto

Discussão sobre o módulo `wallet` (backend NestJS + TypeORM), especificamente
o método `Wallet.confirmBalance` (`backend/src/wallet/service.ts`) e o ledger de
partida dobrada em `backend/src/wallet/domain/ledger.ts`.

## A dúvida inicial

> "Se tiver 10 mil lançamentos, o `confirmBalance` vai reinserir todos no banco?"

**Não.** A escrita não reinsere o histórico:

- `ledger.fund()` (`domain/ledger.ts:72`) retorna **uma única** `Transaction`
  nova (2 entries: `external` / `available`).
- `LedgerRepository.append` (`database/repositories/ledger.repository.ts:42`)
  salva só esse objeto retornado — não o journal inteiro.

Ou seja: o INSERT é sempre de 2 linhas, independente do tamanho do histórico.

## O problema real: a LEITURA

```ts
const ledger = await this.ledgerRepo.findEntries(accountId) // ⬅️ carrega tudo
const transaction = ledger.fund(BigInt(charge.amountCents))
```

`findEntries` (`ledger.repository.ts:16`) faz `getRawMany()` de **todos os
entries de todas as transações da conta**, monta um `Map` e chama
`Ledger.hydrate([...])`. Com 10 mil lançamentos:

- carrega dezenas de milhares de linhas para a memória;
- `hydrate` ainda **revalida cada transação** (`Transaction.create` →
  `assertBalanced`, que faz `reduce` sobre todos os entries).

Custo **O(n) em query + memória + CPU, crescendo sem teto**, a cada confirmação.

E para o `fund` esse trabalho é **inútil**: funding credita `available` com
valor positivo, então `assertSufficientFunds` (que só dispara para delta
negativo) é no-op. Carrega-se o histórico inteiro para não usar.

## "Mas não preciso hidratar para garantir as invariantes do ledger?"

Não. São duas invariantes diferentes, com necessidades opostas:

### Invariante 1 — transação balanceada (soma = 0)

`assertBalanced` (`ledger.ts:26`) olha **só os entries da própria transação**.
Não depende do histórico. Já roda no `Transaction.create` (`ledger.ts:21`), na
construção, sem I/O. Hidratar não acrescenta nada aqui.

### Invariante 2 — saldo não-negativo (não estourar)

`assertSufficientFunds` (`ledger.ts:40`) precisa do estado anterior, mas só de
**um número**: `balanceOf('available')`. Um escalar, não os 10 mil lançamentos.
Esse número vem de:

- `SELECT SUM(amount) WHERE account='available'` (uma linha), ou
- uma coluna de saldo mantida (já existe `wallet.balance`).

### O ponto crítico: hidratar não garante a invariante sob concorrência

O `Ledger` hidratado é um **snapshot do momento da leitura**. Entre o
`findEntries` e o `append`, em concorrência, isso fura (TOCTOU —
time-of-check / time-of-use):

```
req A: lê saldo=100 ─┐
req B: lê saldo=100 ─┤  os dois passam no check em memória
req A: reserva 100  ─┤
req B: reserva 100  ─┘  → saldo final -100  ❌
```

A invariante de não-negatividade só fica de fato garantida no **banco**, dentro
da transação:

- `UPDATE ... SET balance = balance - x WHERE balance >= x` (checar `affectedRows`), ou
- `SELECT ... FOR UPDATE` na linha do saldo antes de decidir, ou
- `CHECK (balance >= 0)` como rede de segurança.

## Resumo

| Invariante | Precisa do histórico? | Onde garantir |
|---|---|---|
| Transação balanceada (soma = 0) | Não — é local | Já em `Transaction.create` |
| Saldo não-negativo | Precisa do **saldo** (1 número), não do journal | No **banco**, atômico (UPDATE condicional / lock) |

O journal completo continua útil para **auditoria / extrato / reconstruir
saldo** (aí lê-se tudo, ou um snapshot). No caminho de escrita
(`confirmBalance`, `reserve`), ele é a ferramenta errada.

## Próximo passo sugerido

Fix mais barato e imediato: `confirmBalance` não chamar `findEntries` — `fund`
não precisa de saldo. Para operações que precisam (`reserve`, payout, saque),
obter o saldo via agregação/coluna e proteger a não-negatividade no banco.
