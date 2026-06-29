# Perkly — Produto, Jornadas e Domínios

# Visão do Produto

O Perkly é uma plataforma de distribuição de pagamentos em massa.

O MVP é focado em campanhas de recompensa via PIX, permitindo que empresas paguem dezenas ou centenas de pessoas sem precisar coletar previamente suas chaves PIX.

Apesar do posicionamento inicial em campanhas, o núcleo do produto é a distribuição de valor em escala.

No futuro, o mesmo motor poderá suportar:

* incentivos
* cashback
* indicação
* pesquisa remunerada
* premiações
* comissões
* reembolsos
* pagamentos a fornecedores
* gift cards

---

# Problema

Hoje empresas que precisam pagar muitas pessoas ainda utilizam:

* planilhas
* coleta manual de chave PIX
* transferências individuais
* retrabalho operacional
* pouca rastreabilidade

O Perkly elimina esse processo.

---

# Proposta de Valor

* pagamentos em massa
* PIX
* rastreabilidade
* sem coleta prévia de chave PIX
* poucos cliques
* automação operacional

---

# Escopo do MVP

O MVP é focado em campanhas de recompensa.

Campanhas são uma abstração comercial e de produto.

O domínio principal do sistema é distribuição de pagamentos.

Nem todo pagamento futuro necessariamente pertencerá a uma campanha.

---

# Jornada da Empresa

```text
Adicionar saldo
↓
Criar campanha
↓
Criar batch
↓
Importar destinatários
↓
Revisar valores
↓
Confirmar envio
↓
Acompanhar status
```

---

# Jornada do Destinatário

```text
Receber notificação
↓
Abrir link
↓
Informar chave PIX
↓
Receber pagamento
```

---

# Jornadas Secundárias

## Pagamentos

```text
Ver pendentes
↓
Ver pagos
↓
Ver expirados
↓
Exportar resultados
```

## Campanhas

```text
Listar campanhas
↓
Abrir campanha
↓
Visualizar batches
↓
Visualizar payouts
```

---

# Conceitos Principais

* Company
* Wallet
* Charge
* Ledger
* Campaign
* Batch
* Payout
* Claim
* Settlement
* Pix Transfer

---

# Entidades

## Company

Representa a empresa parceira.

---

## Campaign

Contexto de negócio do MVP.

Agrupa pagamentos relacionados a:

* pesquisa
* incentivo
* premiação
* indicação

Uma campanha pode possuir vários batches.

---

## Batch

Representa um lote de pagamentos.

Responsabilidades:

* importar destinatários
* validar valores
* calcular total
* confirmar
* cancelar

Estados:

```text
DRAFT
CONFIRMED
PROCESSING
COMPLETED

ou

CANCELED
```

---

## Payout

Representa o direito de uma pessoa receber um valor.

Não representa a transferência PIX.

Estados:

```text
PENDING
CLAIMED
PROCESSING
PAID

ou

FAILED
EXPIRED
```

---

## Claim

Representa o processo de resgate.

Responsabilidades:

* gerar link
* receber chave PIX
* expirar
* impedir reutilização

Estados:

```text
PENDING
CLAIMED

ou

EXPIRED
```

---

## Charge

Representa uma adição de saldo.

Estados:

```text
PENDING
PAID
EXPIRED

ou

FAILED
```

---

# Wallet

Representa o saldo da empresa.

Responsabilidades:

* reservar saldo
* liberar saldo
* consumir saldo
* consultar saldo

O Wallet não conhece PSP.

---

# Ledger

Responsável pela consistência financeira.

Usa partidas dobradas.

Toda transação deve somar zero.

---

# Contas do Ledger

```text
external
available
reserved
revenue
```

---

# Convenção

```text
+ valor = dinheiro entrou na conta
- valor = dinheiro saiu da conta
```

---

# Exemplos

## Fund

```text
External  -1000
Available +1000
```

---

## Reserve

```text
Available -300
Reserved +300
```

---

## Payout liquidado

```text
Reserved -50
External +50
```

---

## Expiração

```text
Reserved -50
Available +50
```

---

# Tipos do Ledger

## ledger_account

```text
external
available
reserved
revenue
```

## transaction_type

```text
fund
reserve
settle
expire
```

---

# Bounded Contexts

## Funding Context

Responsável por:

* charges
* depósitos
* saldo inicial

---

## Wallet Context

Responsável por:

* saldo disponível
* saldo reservado
* consumo
* liberação

---

## Ledger Context

Responsável por:

* partidas dobradas
* transações financeiras
* integridade financeira

---

## Campaign Context

Responsável por:

* campanhas
* objetivos
* organização

---

## Payout Context

Responsável por:

* batches
* payouts
* destinatários

---

## Claim Context

Responsável por:

* links
* resgates
* chaves PIX

---

## Settlement Context

Responsável por:

* PSP
* PIX
* webhooks
* liquidação

---

# Relação entre Contextos

```text
Company
    │
    ├── Wallet
    │     │
    │     ├── Charges
    │     └── Ledger
    │
    └── Campaigns
            │
            └── Batches
                    │
                    └── Payouts
                            │
                            └── Claims
                                    │
                                    └── Settlement
```

---

# Fluxo Financeiro

## Adição de saldo

```text
Charge
↓
Webhook PSP
↓
Ledger fund()
↓
Wallet credit
```

---

## Confirmação do Batch

```text
Wallet.reserve()
↓
Batch.confirm()
↓
Payouts.create()
```

---

## Resgate

```text
Claim.claim()
```

Não altera o ledger.

---

## Liquidação PIX

```text
PSP
↓
Webhook
↓
wallet.consume()
↓
payout.markPaid()
```

---

# Princípios Arquiteturais

* dinheiro nunca desaparece
* dinheiro nunca duplica
* PSP é infraestrutura
* Wallet não conhece PSP
* Payout não é PIX
* Claim não movimenta dinheiro
* Ledger é a fonte da verdade financeira
* Campanha é uma abstração do MVP
* O núcleo do produto é distribuição de pagamentos

---

# Regra Importante

Quando uma operação não pode ser feita em uma única transação, o sistema utiliza estados para representar onde o processo parou e comportamentos para avançar de forma segura até um novo estado consistente.

Estados existem porque sistemas distribuídos não conseguem fazer:

```sql
BEGIN;

o mundo inteiro;

COMMIT;
```
