# guide — princípios de design (bom vs ruim)

Rule de design para este codebase. Os exemplos são reais, tirados do módulo
wallet/ledger. Cada princípio declara o **eixo de mudança** que ele barateia e o
**custo** que aceita em troca. Design bom é assimétrico de propósito: você torna
a mudança *provável* barata e aceita que a mudança *improvável* fica cara — não
existe "fácil de mudar" em abstrato.

> Como usar: ao revisar ou escrever código aqui, rode o **teste do "onde isso
> aterrissa?"** — pegue uma mudança realista e conte quantos arquivos/camadas ela
> toca. Design bom: aterrissa num lugar só, e é o lugar que você teria adivinhado.
> Design ruim: *shotgun surgery*.

---

## Princípio-raiz: ETC (Easier To Change)

DRY, KISS, ortogonalidade e direção de dependência são **meios** para ETC, não
fins. Toda decisão responde a uma pergunta: *isso fica mais fácil ou mais difícil
de mudar ao longo do eixo em que este componente está exposto a mudar?*

ETC é **local**. Você não torna tudo mutável (isso é impossível e vira mush — o
over-engineering de Clean Arch/DDD). Você identifica o eixo provável, barateia
*ele*, concentra num lugar só, e encarece explicitamente o eixo improvável.

> **Declare a troca em cada decisão:** "este código barateia a mudança X ao
> encarecer a mudança Y." Se você não consegue nomear X e Y, não decidiu nada.

---

## DRY — duplicação de *conhecimento*, não de código

DRY é sobre haver **uma fonte autoritativa por pedaço de conhecimento**. Não é
sobre código que *parece* igual. Código com a mesma forma mas representando
decisões independentes deve permanecer separado.

### ✅ Falso positivo — repetição que está CERTA

`Ledger.fund/reserve/settle/expire` têm forma quase idêntica (`id`, `timestamp`,
`type`, `entries`). É tentador "DRY-ar" num método genérico parametrizado.

```ts
fund(amount, at = new Date) {
  return this.post({ id: crypto.randomUUID(), timestamp: at, type: 'fund',
    entries: [{ account: 'external', value: -amount }, { account: 'available', value: amount }] })
}
reserve(amount, at = new Date) {
  return this.post({ id: crypto.randomUUID(), timestamp: at, type: 'reserve',
    entries: [{ account: 'available', value: -amount }, { account: 'reserved', value: amount }] })
}
```

**Não unifique.** Cada método codifica um *conhecimento contábil diferente*:
quais contas, qual sinal. São decisões independentes que por acaso compartilham
forma. Forma igual ≠ conhecimento igual. O dia que `settle` ganhar uma terceira
entry (fee), você vai querer que ele seja editável sozinho.

### ❌ Violação real — uma verdade materializada duas vezes

```ts
// confirmBalance
await this.ledgerRepo.append(charge.walletId, transaction)   // verdade 1: o ledger
await this.walletRepo.applyCredit(charge.walletId, charge.amountCents) // verdade 2: coluna wallet.balance
```

"Quanto o cliente tem" é **um** conhecimento, escrito em dois lugares que
precisam concordar à mão. `findBalances` lê só o ledger — a coluna `balance` é
write-only neste código. Ou existe um leitor escondido (e os dois vão divergir e
mentir em silêncio), ou é peso morto que pode dessincronizar.

**Correção:** escolha uma verdade. Derive saldo do ledger e **delete a coluna**,
ou trate a coluna como cache explícito e leia dela. Ledger-como-verdade *e*
coluna mantida à mão é a definição do problema.

---

## KISS — a peça mais simples é a que não existe

### ❌ Ruim

A coluna `wallet.balance`, o método `applyCredit`, o fragmento SQL interpolado
(`balance: () => \`balance + ${amountCents}\``) e o round-trip de `findAccountId`
existem para manter uma segunda contagem que `findBalances` nem lê.

### ✅ Bom

Derivar saldo do ledger e remover a coluna. Some `applyCredit`, some a
interpolação SQL (e o risco de injeção que mora num comentário "trusted"), some a
chance de divergir.

> Note: KISS e DRY apontaram para o **mesmo alvo** (a coluna `balance`). Quando
> princípios independentes convergem no mesmo trecho, é diagnóstico forte de
> dívida real — não preferência estética.

---

## Ortogonalidade — o que varia sozinho deve girar sozinho

Teste: *mudar A força mudar B?* Se sim, A e B não são ortogonais.

### ❌ Ruim — formato do PSP soldado ao modelo interno

```ts
async addBalance(input) { ... return charge }   // retorna o Charge cru, com snake_case
// controller
return { pixQrCode: charge.pix_qr_code, expiresAt: charge.expires_at }
```

O retorno de `addBalance` é o tipo do PSP. "Formato do charge" e "contrato da API
pública" não são ortogonais: mexer num mexe no outro. Pior — o tipo `Charge`
está em `snake_case` (`pix_qr_code`, `expires_at`) enquanto o controller fala
`camelCase`. Isso é uma **fronteira de convenção bagunçada dentro de código 100%
seu** (o `Psp` é mock, você definiu o tipo). Quando o client real do Celcoin
entrar, ele deve traduzir *para* o seu `Charge` — se o seu tipo já imita "cara de
API externa", você pré-vazou acoplamento a um sistema que nem existe.

### ✅ Bom — uma convenção, um vocabulário interno fixado por você

```ts
export type Charge = {
  id: string; amountCents: bigint; status: ChargeStatus
  pixQrCode?: string; expiresAt: Date
}
```

O adapter (`Psp`) é onde *você* fixa o vocabulário interno. Fixe **um só**
(camelCase). Agora "vendor" e "domínio" giram em eixos separados.

---

## Tornar estado ilegal irrepresentável

O tipo deve modelar o **conceito inteiro**, não o instante de nascimento, e não
deve aceitar estados que o resto do sistema sabe que existem.

### ❌ Ruim — tipo que mente sobre o ciclo de vida

```ts
export type Charge = { ...; status: 'PENDING' }   // só pode ser PENDING
async charge(amount: bigint, method: string) { ... }  // aceita qualquer string
```

Dois defeitos: (1) `status: 'PENDING'` diz que charge *só* nasce e morre PENDING,
mas `confirmBalance` já checa `charge.status === 'PAID'` — **o consumidor assume
estados que o tipo proíbe**, contradição de modelo. (2) `method: string` aceita
`'pix'`, `'boleto'`, `'lixo'` e só falha em runtime com `throw`. A borda
(`CreateChargeBody`) já sabia que era `'pix' | 'boleto'` — a informação foi
**jogada fora** ao descer pro service como `string`.

### ✅ Bom

```ts
export type ChargeStatus = 'pending' | 'paid' | 'expired' | 'failed'
export type ChargeMethod = 'pix' | 'boleto'
async charge(amount: bigint, method: ChargeMethod): Promise<Charge>
```

`method: ChargeMethod` faz `'boleto'` não-implementado virar erro de
**compilação** (switch exaustivo), não surpresa de produção. O `throw` genérico
era sintoma de ter alargado o tipo sem necessidade. **Princípio:** não alargue um
tipo na assinatura quando você já tinha a informação estreita na borda.

---

## Tell, Don't Ask — mande o dono do dado fazer o trabalho

### ❌ Ruim — puxa os números crus e calcula de fora

```ts
async findBalances(accountId) {
  const balance = await this.ledgerRepo.loadBalances(accountId)
  const available = balance.available ?? 0n
  const reserved = balance.reserved ?? 0n
  const total = available + reserved     // regra "total = avail + reserved" solta no service
  return { available: ..., reserved: ..., total: ... }
}
```

A regra de *o que compõe "total"* mora no service, longe do dono do conceito (o
`Ledger`). O dia que `total` passar a descontar algo, você caça aritmética
espalhada.

### ✅ Bom — diga ao Ledger que te dê o resumo

```ts
// Ledger
summary() {
  const available = this.balanceOf('available')
  const reserved = this.balanceOf('reserved')
  return { available, reserved, total: available + reserved }
}
// service
return Ledger.hydrate(snapshot).summary()
```

`ledger.fund(amount)` no `confirmBalance` já é Tell-Don't-Ask bem feito — o
`findBalances` era o destoante. **Princípio:** não puxe dado pra decidir/calcular
fora; mande o objeto que detém o dado fazer o trabalho.

---

## Direção de dependência — dependências apontam para a estabilidade

### ✅ O acerto estrutural (preservar)

`Ledger`/`Transaction` não importam Nest, TypeORM nem PSP. A coisa mais estável
do sistema (as regras contábeis) não depende de nada volátil. Testável com zero
infra e zero mock.

### ❌ Onde inverte

O shape do PSP (o mais volátil que existe) flui *para dentro* até virar o
contrato de API pública. Dependência apontando de estável (API pública) para
instável (formato do vendor) — direção errada. Secundário: `toDomain` devolve
`LedgerTransactionEntity` (entidade TypeORM) como se fosse "domínio", criando
duas noções de domínio convivendo.

### ✅ Correção

O adapter normaliza na borda → nada estável volta a depender do shape do vendor.
O vendor é o menos estável de todos; nada deve depender da cara dele.

---

## Invariante: proteger, não só verificar uma vez

`Transaction.create` chama `assertBalanced` na construção e tem construtor
privado — ótimo, não dá pra criar transação desbalanceada por fora. **Mas:**

```ts
private constructor(readonly props: TransactionProps) {}  // props.entries: Entry[]
```

`readonly props` protege a reatribuição de `props`, não a mutação de dentro.
`tx.props.entries.push({ account: 'revenue', value: 100n })` desbalanceia depois
de criada e ninguém percebe.

✅ `entries: readonly Entry[]` (ou `ReadonlyArray<Entry>`) fecha o estado ilegal
que o tipo ainda deixa existir.

---

## Critérios por camada (referência rápida)

| Camada | Eixo de mudança | Critério / teste | Smell quando viola |
|---|---|---|---|
| **Adapter (`Psp`)** | o fornecedor | grep do nome do vendor fica só aqui; a porta sobrevive à troca com assinatura intacta; erros normalizados | conceito do vendor (ou convenção dele) aparece fora do adapter |
| **Domínio (`Ledger`)** | regra de negócio / invariante | um caminho só para instância válida e ele força a invariante; conta estados ilegais representáveis; testável sem infra | construível inválido; `status:string` + nullables permitindo combinação ilegal; precisa mock pra testar regra |
| **Controller** | contrato de API (shape req/resp) | deletar a camada HTTP não perde lógica; entidade não serializa direto; validação estrutural na borda, de negócio no domínio | regra de negócio em decorator; entidade vazando na resposta |
| **Service (`Wallet`)** | orquestração do caso de uso | lê-se o *workflow* sem ler as *regras*; importa abstração (`PaymentRail`), não concreto; uma razão pra mudar | `if` de política de negócio; fronteira transacional cobrindo I/O externo; aritmética de domínio solta |

---

## Meta-lições (como diagnosticar)

1. **Convergência = smell real.** Um defeito verdadeiro é apontado por vários
   princípios ao mesmo tempo (a coluna `balance`: DRY + KISS + ortogonalidade).
   Um falso positivo é apontado por um só e *contestado* pelos outros
   (`fund/reserve/settle/expire`: DRY "reclama", os demais defendem a separação).

2. **Sintoma é fácil, causa é onde se erra.** `pix_qr_code` no controller
   incomoda (sintoma correto), mas a causa não era "vendor externo vazando" — era
   convenção interna inconsistente em código próprio. Localizar o trecho é fácil;
   atribuir a causa exige olhar a *origem do tipo*, não presumir.

3. **A disciplina vale com mock.** O `Psp` é stub, mas a forma do `Charge` que
   você fixa agora é o contrato que o client real do Celcoin vai ter que traduzir
   *para*. Modelar torto agora propaga o erro para quando a integração chegar.