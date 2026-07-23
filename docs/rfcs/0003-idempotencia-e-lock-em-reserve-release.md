# RFC 0003 — Idempotência e serialização de `reserve()`/`release()` via lock no Postgres

- **Status:** aceito
- **Data:** 2026-07-22
- **Contexto de código:** `backend/src/wallet/`

---

## Problema

`reserve()`/`release()` são a porta pública (`BalanceReservation`) que outros
contextos usam pra comprometer/devolver saldo do cliente (`available` ↔
`reserved`) — hoje o único chamador é `CampaignService.confirm`. Diferente de
`confirmBalance` (que só soma dinheiro que chegou via evento de pagamento),
aqui a operação **decide com base no saldo atual**: `reserve()` só pode
proceder se `available >= amount`. Isso expõe duas falhas clássicas de
leitura-decide-escreve concorrente que `confirmBalance` não tem:

1. **Reentrega duplicada.** O chamador roda dentro do próprio
   `@Transactional()` dele (`confirm` propaga pra mesma tx) e pode ser
   retentado — retry de rede, redelivery de fila no caminho de `release()`
   futuro (payout expirado). Sem proteção, a mesma intenção de negócio
   ("reserva X para a campanha Y") executaria duas vezes, debitando o dobro de
   um saldo que só devia sair uma vez.
2. **Corrida read-then-decide.** Duas reservas concorrentes na **mesma
   conta**, cada uma lendo o saldo via `LedgerRepository.loadBalances`
   (agregado em SQL sobre a tabela de ledger) antes da outra commitar, podem
   ambas ver "10000 disponível", ambas decidirem que 6000 cabe, e ambas
   commitarem — 12000 reservado de um saldo de 10000.
   `Ledger.assertSufficientFunds` só protege dentro de **uma** instância do
   agregado em memória; não enxerga a escrita concorrente de outra transação.

A pergunta desta RFC: como fechar as duas falhas sem introduzir um lock
distribuído novo, dado que o Postgres já é a fonte de verdade e já está no
caminho crítico?

---

## Decisões

### 1. Idempotência via inbox (`balance_operation`, `INSERT … ON CONFLICT DO NOTHING RETURNING`)

`WalletRepository.claimOperation(idempotencyKey)` insere a chave numa tabela
dedicada (`BalanceOperationEntity`, `idempotency_key` único). `true` = esta
chamada inseriu (dona do processamento); `false` = a chave já existia
(reentrega → no-op imediato, sem tocar no ledger). Mesmo padrão já usado por
`PayoutRepository.claimPage` e `ChargeRepository.findByIdempotencyKeyForUpdate`
— não é uma técnica nova no código, é a terceira aplicação dela.

**Por quê:** o índice único faz o próprio Postgres serializar entregas
concorrentes da mesma chave — a segunda `INSERT` bloqueia até a primeira
commitar/rollbackar, então nunca duplica nem perde, mesmo sob concorrência
real (duas instâncias da API processando a mesma redelivery ao mesmo tempo).

**Alternativa rejeitada:** checar "já existe reserva com essa key?" via
`SELECT` antes de decidir. É a mesma corrida read-then-decide do problema
2, só que na dimensão idempotência: dois `SELECT`s concorrentes veem "não
existe" e os dois prosseguem. `INSERT … ON CONFLICT` não tem essa janela
porque a exclusão mútua é a própria constraint, não uma decisão da
aplicação.

### 2. Serialização via lock pessimista na linha da `wallet` (`FOR UPDATE`), não no ledger

`WalletRepository.findByAccountIdForUpdate` faz o mesmo `findByAccountId`,
mas com `lock: { mode: 'pessimistic_write' }` (`SELECT … FOR UPDATE`). A
fonte de verdade do saldo é o ledger (soma de `LedgerTransactionEntity`), não
a linha da `wallet` — mas o ledger é **append-only**: travar linhas que já
existem não impede outra transação de **inserir** uma nova transação de
ledger concorrente, porque `INSERT` não é bloqueado por lock em linhas
existentes. Não há, na tabela de ledger, uma linha singular por conta que
sirva de ponto de exclusão mútua.

A `wallet` é exatamente isso: uma linha por conta, que já existe, e que
nenhuma outra operação de negócio precisa mutar concorrentemente por outro
motivo. Ela vira o **handle do mutex por conta** — o lock nela não protege
o dado que ela guarda (a coluna `balance` é outra história, ver
`CLAUDE.md`), protege a **decisão** que `reserve`/`release` fazem sobre o
saldo agregado do ledger.

**Por quê:** `SELECT … FOR UPDATE` é bloqueante — a segunda transação que
tentar travar a mesma linha espera até a primeira commitar ou dar rollback.
Isso fecha a janela do problema 2: a segunda reserva só lê o saldo (via
`loadBalances`) **depois** que a primeira já commitou sua própria alteração,
então ela vê o saldo já debitado e recusa corretamente se não couber.

**Alternativa rejeitada — travar as linhas do ledger:** não serializa
`INSERT`s novos (a razão acima). Teria que ser algo como `SELECT … FOR
UPDATE` numa tabela de "saldo materializado" por conta — que é exatamente o
papel que a `wallet` já cumpre, sem precisar desenhar uma tabela nova.

**Alternativa rejeitada — lock distribuído (Redis, mutex em memória):** um
mutex em memória do processo Node não serializa nada entre instâncias
(a API já roda horizontalmente) — resolveria a corrida só num único
processo e mentiria sob múltiplas réplicas. Um lock distribuído em Redis
funcionaria, mas introduz uma segunda fonte de verdade sobre "quem está
mexendo nesta conta agora", com seu próprio problema de expiração/renovação
e mais um componente na infra para uma garantia que o Postgres — que já é
obrigatório, já está na transação, já é a fonte de verdade do dinheiro —
oferece de graça via `FOR UPDATE`.

### 3. Claim de idempotência ANTES do lock — ordem importa

Em `reserve()`/`release()`, `claimOperation` roda primeiro; só se `claimed
=== true` é que `findByAccountIdForUpdate` é chamado.

**Por quê:** uma reentrega (o caso comum em at-least-once delivery) retorna
rápido, sem nunca disputar o lock da linha da `wallet`. Se a ordem fosse
invertida — travar primeiro, checar idempotência depois — toda reentrega
pagaria o custo de esperar a fila do lock pessimista antes de descobrir que
não tinha nada a fazer, competindo por um recurso escasso à toa.

### 4. `pessimistic_write`, não `pessimistic_read` / lock otimista / advisory lock

`lock: { mode: 'pessimistic_write' }` (`FOR UPDATE`, exclusivo) — não
`pessimistic_read` (`FOR SHARE`, compartilhado).

**Por quê exclusivo e não compartilhado:** o problema 2 não é "alguém pode
escrever enquanto eu leio" (isso `FOR SHARE` resolveria), é "duas
transações não podem **decidir** com base no mesmo snapshot ao mesmo
tempo". Se o lock fosse `FOR SHARE`, duas reservas concorrentes
segurariam o lock **juntas**, cada uma leria o mesmo saldo pré-commit, e
a corrida do problema 2 voltaria inteira — `FOR SHARE` só serializa contra
escritores, não entre leitores que vão decidir e escrever depois. Precisa
ser mútuo excludente entre os próprios `reserve()`/`release()`, daí
exclusivo.

**Alternativa rejeitada — lock otimista (coluna de versão + retry):**
funciona bem sob baixa contenção e não segura conexão em fila de espera,
mas exige que o chamador (`CampaignService.confirm`, hoje sem retry)
trate o conflito refazendo leitura + decisão do zero. Sob contenção real
(a mesma conta recebendo várias reservas concorrentes) tende a
**thrashing**: cada tentativa perdida já pagou o custo de ler o ledger e
rodar a decisão de domínio, só para descobrir o conflito no commit e
recomeçar. Pessimista falha rápido (espera o lock, não a computação) e
não desperdiça trabalho de domínio já feito.

**Alternativa rejeitada — advisory lock (`pg_advisory_xact_lock`):**
resolveria a exclusão mútua sem depender de uma linha real, mas
`accountId` é UUID — precisaria de hash pra virar chave `bigint`, mais uma
API crua (TypeORM não tem suporte de primeira classe) para uma garantia
que `lock: { mode: 'pessimistic_write' }` já dá em cima de uma linha que
já existe e já é lida na mesma operação.

**Por que só em `reserve`/`release`, não em todo método do `WalletRepository`:**
cada método trava a **linha que é o ponto de serialização da sua própria
operação**, não "a wallet" por hábito. `confirmBalance` trava a `charge`
(`ChargeRepository.findByIdempotencyKeyForUpdate`) porque a disputa ali é
"esta cobrança específica sendo confirmada duas vezes", não o saldo da
conta. `findBalances` não trava nada — é leitura pura, uma resposta
levemente desatualizada é aceitável para um relatório de saldo, e travar
ali só criaria contenção sem comprar corretude. `addBalance` não mexe no
ledger (só abre uma cobrança no PSP), não há decisão concorrente a
proteger.

---

## O que ganha

- **Corretude sem inventar infra nova.** A garantia de exclusão mútua por
  conta funciona **entre processos** — a API já roda horizontalmente, e um
  lock em memória do processo não serve para isso. `FOR UPDATE` é do
  Postgres, que já é a fonte de verdade e já está na mesma transação; não
  há um segundo sistema (Redis, Zookeeper) para manter consistente com o
  primeiro.
- **Leitura não paga o preço.** `FOR UPDATE`/`FOR SHARE` só bloqueiam contra
  outros lockers; um `SELECT` comum (o que `findBalances` faz) não espera a
  fila do lock pessimista. Só quem também precisa decidir-e-escrever entra
  na fila.
- **Rollback desfaz tudo junto.** Como o claim de idempotência e o lock
  vivem na mesma `@Transactional()`, uma reserva recusada por saldo
  insuficiente desfaz o claim também — a chave fica livre para uma
  tentativa futura legítima (ex.: depois de o cliente adicionar saldo),
  em vez de ficar presa a uma tentativa que falhou.
- **Sem deadlock hoje.** Cada transação trava no máximo **uma** linha de
  `wallet` (a da própria conta) — não há ciclo possível com o desenho
  atual.

## O que perde / a troca

- **Serialização total por conta.** Duas reservas concorrentes na mesma
  conta nunca rodam em paralelo — a segunda espera a primeira commitar
  (que inclui o round-trip de `loadBalances` + `append` no ledger, não só
  o lock em si). Isso é aceito porque contas diferentes não competem entre
  si — o lock é por linha, não uma trava global — e volume normal por
  conta não gera fila perceptível.
- **A tabela `balance_operation` só cresce.** Não há expiração/limpeza da
  chave de idempotência — cada `reserve()`/`release()` que já rodou deixa
  uma linha para sempre. Mesma dívida que `payout_page`/`charge`
  provavelmente já carregam; não é nova, mas está sendo nomeada aqui.

---

## Onde isso provavelmente quebra à medida que escala

- **Conta muito ativa vira fila.** O cenário mais provável de dor não é
  "o sistema todo", é **a conta do maior cliente** — quem roda mais
  campanhas simultâneas é, por construção, quem mais dispara `reserve()`
  concorrente na mesma linha. O gargalo aparece primeiro exatamente nas
  contas mais valiosas, não distribuído igualmente pela base.
- **Lock seguro durante I/O, não só durante o cálculo.** A trava é
  liberada só no commit/rollback da transação inteira — que inclui o
  `SELECT` agregado do ledger e o `INSERT` da nova transação, não apenas a
  decisão em memória. Sob contenção alta numa mesma conta, isso alonga o
  tempo que **cada** conexão do pool fica ocupada esperando ou segurando o
  lock.
- **Esgotamento de pool por efeito colateral.** Esse é o risco mais sério
  de escala: se várias chamadas concorrentes na mesma conta enfileiram
  esperando o lock, cada uma **segura uma conexão do pool** enquanto
  espera. Sob contenção forte o suficiente, o pool pode esgotar antes do
  lock — e aí requisições para **contas completamente diferentes**, que não
  tinham nada a ver com a conta quente, começam a falhar por falta de
  conexão. A dor deixa de ficar isolada na conta que a causou.
- **`release()` ainda não está no ar** — hoje só `reserve()` é chamado
  (via `CampaignService.confirm`). Quando o fluxo de expiração de payout
  ligar `release()`, ele passa a competir pelo **mesmo** lock por conta que
  `reserve()` — os dois fluxos (confirmação de nova campanha e expiração de
  payout antigo) somam contenção na mesma linha, não são independentes.
- **Landmine para uma feature que não existe ainda:** se algum dia surgir
  uma operação que precisa travar **duas** contas na mesma transação (ex.:
  transferência entre clientes), a ordem de aquisição do lock passa a
  importar — travar sempre pela mesma ordem (ex.: `externalId` ordenado)
  evita deadlock. Hoje isso não existe porque nenhuma operação trava mais
  de uma `wallet` por vez; documentando aqui para não ser esquecido quando
  essa operação aparecer.

---

## Limite honesto (quando isto não é suficiente)

Isso serializa corretamente **uma conta contra ela mesma**, dentro de **um**
Postgres. Não resolve (e não tenta resolver) contenção entre contas — não
precisa, porque contas são independentes por definição de negócio. Se um
dia o wallet for particionado em múltiplos bancos (sharding por conta), o
lock continua correto por shard, sem mudança — a garantia é por linha, não
por instância de banco.

---

## Adiado (dívida consciente)

- Expiração/limpeza de `balance_operation` (mesma dívida de
  `payout_page`/idempotência de charge).
- Teste de carga que meça o ponto real onde a fila do lock começa a doer
  (hoje só há teste funcional de correção — ver
  `test/wallet/reserve.integration-spec.ts`).
- Ordenação de lock multi-conta, caso uma operação cross-account apareça.
