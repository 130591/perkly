# Perkly ↔ Celcoin — Mapa de Fluxos, Endpoints e Payloads

> Referência técnica para a integração do Perkly (payout em massa via PIX) com a Celcoin como PSP do MVP.
> Base nas APIs **cel_banking / BaaS & Core** (`openfinance.celcoin.dev`), que é a linha correta para quem opera conta proprietária com saldo gerenciável e os dois lados do fluxo (cash-in das parceiras e cash-out para recipients).
> A linha `cel_payments` (`api.sandbox.cel.cash`) **não** é o alvo aqui.

---

## 0. Decisão arquitetural que precede tudo

A Celcoin **não conhece** os conceitos de "empresa parceira", "campanha" ou "recipient". Para a Celcoin existe **uma conta proprietária** (conta bolsão) com um saldo físico.

Consequência direta para o Perkly:

- **Saldo físico (custódia):** vive na conta bolsão única na Celcoin.
- **Saldo lógico (verdade de negócio):** vive no **seu ledger double-entry append-only**, que segrega por `empresa → campanha`. Essa é a fonte única de verdade do "quanto a Empresa A tem disponível na Campanha X".
- A Celcoin é a **primeira implementação concreta** do seu port `PaymentRail`. Nada no domínio do Perkly fala "Celcoin" diretamente.
- A conciliação entre os dois saldos (físico vs. lógico) é responsabilidade sua, ancorada nos webhooks e nos identificadores `clientCode` / `clientRequestId`.

```
┌────────────────────────────────────────────────────────────┐
│ PERKLY (ledger lógico — fonte de verdade)                   │
│                                                             │
│  Empresa A ── Campanha 1 ── saldo: R$ 8.000                 │
│            └─ Campanha 2 ── saldo: R$ 1.250                 │
│  Empresa B ── Campanha 1 ── saldo: R$ 500                   │
│                                                             │
│   Σ saldos lógicos  ≈  saldo físico na Celcoin (conciliar)  │
└───────────────────────────┬────────────────────────────────┘
                            │  PaymentRail (port)
                ┌───────────┴───────────┐
                │  CelcoinPaymentRail    │  (adapter)
                └───────────┬───────────┘
                            │
┌───────────────────────────┴────────────────────────────────┐
│ CELCOIN (conta bolsão única — custódia física)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Ambientes e autenticação

### URLs base

| Ambiente | Base URL (BaaS/Pix) |
|---|---|
| Sandbox | `https://sandbox.openfinance.celcoin.dev` |
| Produção | `https://api.openfinance.celcoin.com.br` |

### Autenticação — OAuth 2.0 `client_credentials`

- **Grant type:** `client_credentials`.
- **Credenciais:** `client_id` + `client_secret` (fornecidos pelo suporte/comercial mediante CNPJ + produtos).
- **Validade do token:** a doc cita ~2400s no exemplo de sandbox do BaaS e 3600s no fluxo genérico. **Trate como ~40 min e renove por expiração, não por requisição.**
- **Produção exige a mais:** certificado **mTLS** (`.crt` + `.key` gerados pela Celcoin) e **allowlist de IPs**. Em sandbox a ausência de mTLS não bloqueia.

**Request (sandbox, form):**
```bash
curl --location --request POST 'https://api.openfinance.celcoin.com.br/v5/token' \
  --header 'accept: application/json' \
  --form 'client_id="SEU_CLIENT_ID"' \
  --form 'grant_type="client_credentials"' \
  --form 'client_secret="SEU_CLIENT_SECRET"'
# produção: acrescentar  --key chave_decrypted.key --cert certificado.crt
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 2400,
  "token_type": "bearer"
}
```

Uso nas chamadas seguintes: header `Authorization: Bearer {access_token}`.

> **Nota Perkly:** o adapter deve ter um `TokenProvider` com cache + refresh proativo (margem de ~60s antes do `expires_in`). Token expirado no meio de um lote de payout é uma falha previsível — não deixe virar erro de runtime.

---

## 2. Mapa geral dos fluxos

### 2.1 Perkly → Celcoin (chamadas REST que VOCÊ faz)

| # | Fluxo de negócio Perkly | Operação Celcoin | Método + Endpoint |
|---|---|---|---|
| A | Empresa parceira adiciona saldo à campanha | Criar cobrança cash-in (QR dinâmico imediato) | `POST /pix/v1/brcode/dynamic` (ou location + cobrança em 2 etapas) |
| A' | (alternativa) saldo via cobrança reutilizável | Criar QR Code estático | `POST /pix/v1/brcode/static` |
| B | Resolver chave do recipient antes do payout | Consultar DICT | `GET /pix/v1/dict/v2/key/{chave}` *(consome fichas — ver §5)* |
| C | Pagar o recipient (payout) | Iniciar pagamento Pix (cash-out) | `POST /baas/v2/pix/payment` |
| D | Conferência/contingência de um payout | Consultar status do pagamento | `GET /baas/v2/pix/payment/status` |
| E | Devolver um recebimento (estorno cash-in) | Devolução de cash-in | `POST .../v1/pix/reverse` |

### 2.2 Celcoin → Perkly (webhooks que VOCÊ recebe)

| Evento (`entity`) | Significado no Perkly | Ação no ledger |
|---|---|---|
| `pix-payment-in` | Empresa parceira pagou o QR → **saldo entrou** | Credita campanha (após validar `amount`) |
| `pix-payment-out` | Payout para recipient **confirmado ou com erro** | Confirma o débito otimista **ou** estorna |
| `pix-reversal-in` | Um payout que fizemos **voltou** (recipient/PSP devolveu) | Re-credita campanha |
| `pix-reversal-out` | Confirmação de uma **devolução que nós fizemos** de um cash-in | Confirma débito do estorno |

> **Nomenclatura dupla:** a doc tem dois formatos de payload de webhook convivendo — o **novo, baseado em `entity`** (`pix-payment-out`, etc.) e o **legado, baseado em `RequestBody`/`TransactionType`** (`PAYMENT`, `REVERTED`, etc.). Trate ambos no handler ou confirme com o suporte qual está ativo na sua conta. Os dois estão documentados abaixo.

---

## 3. FLUXO A — Cash-in: empresa parceira adiciona saldo

Objetivo: gerar um QR Code PIX que a empresa parceira paga; o dinheiro cai na conta bolsão; o webhook `pix-payment-in` confirma; você credita a campanha no ledger.

### 3.1 Criar cobrança QR dinâmico imediato (chamada única `Dynamic`)

O `clientRequestId` é a **sua âncora de conciliação** — codifique nele a empresa/campanha (ex.: `topup:empresaA:camp1:{uuid}`).

**Request — `POST /pix/v1/brcode/dynamic`:**
```json
{
  "clientRequestId": "topup-empresaA-camp1-9b26edb7",
  "key": "CHAVE_PIX_DA_SUA_CONTA_CELCOIN",
  "amount": {
    "original": 8000.00
  },
  "calendar": {
    "expiration": 3600
  },
  "debtor": {
    "name": "Empresa A LTDA",
    "cnpj": "12345678000190"
  }
}
```
- `key`: chave PIX da **sua** conta BaaS (gerada pelo suporte após homologação).
- `amount.original`: valor da cobrança.
- `calendar.expiration`: segundos até expirar (default 86400 = 24h se omitido).
- `debtor`: dados do pagador (a empresa parceira).

**Response (resumido):**
```json
{
  "status": "ACTIVE",
  "transactionId": 9167108,
  "clientRequestId": "topup-empresaA-camp1-9b26edb7",
  "location": {
    "emv": "00020101021226980014br.gov.bcb.pix...6304A3FF",
    "locationId": "12730614"
  }
}
```
- `emv`: o "PIX copia e cola" / conteúdo do QR Code que você devolve para a empresa parceira pagar.
- Persista `transactionId` e `clientRequestId` para casar com o webhook.

### 3.2 (Alternativa) QR Code estático reutilizável — `POST /pix/v1/brcode/static`

Use quando a empresa for fazer aportes recorrentes na mesma campanha (o estático aceita múltiplos pagamentos; o dinâmico imediato é one-shot).

**Request:**
```json
{
  "key": "CHAVE_PIX_DA_SUA_CONTA_CELCOIN",
  "amount": 8000.00,
  "transactionIdentification": "topup-empresaA-camp1",
  "merchant": {
    "postalCode": "01201005",
    "city": "Barueri",
    "merchantCategoryCode": 0,
    "name": "Perkly"
  },
  "additionalInformation": "Aporte campanha 1",
  "withdrawal": false
}
```
**Response:**
```json
{
  "transactionId": 9179311,
  "emvqrcps": "00020126730014br.gov.bcb.pix...6304C3A1",
  "transactionIdentification": "topup-empresaA-camp1"
}
```

### 3.3 Webhook de confirmação — `pix-payment-in`

> ⚠️ **Invariante crítico:** valide `amount` do webhook contra o valor esperado da cobrança **antes** de creditar. Credite pelo valor **confirmado**, nunca pelo valor que você esperava. Esse é o ponto que vira um `assert` explícito no seu `assertBalanced`.

**Formato novo (`entity`):**
```json
{
  "entity": "pix-payment-in",
  "createTimestamp": "2023-07-27T10:03:31.233+00:00",
  "status": "CONFIRMED",
  "body": {
    "amount": 8000.00,
    "oldBalance": 50.00,
    "currentBalance": 8050.00,
    "id": "7d89772a-6fbe-4cbf-a3c3-fc7f31aa63c9",
    "endToEndId": "E1393589320230727130301498341234",
    "transactionIdentification": "topup-empresaA-camp1",
    "transactionIdBRCode": "761678748",
    "initiationType": "DYNAMIC_QRCODE",
    "debitParty": {
      "bank": "12345678", "branch": "0001", "account": "300123",
      "taxId": "12345678000190", "name": "Empresa A LTDA",
      "accountType": "CACC", "personType": "LEGAL_PERSON"
    },
    "creditParty": {
      "bank": "13935893", "branch": "0001", "account": "300123",
      "taxId": "13935893000109", "name": "Perkly", "accountType": "TRAN"
    }
  }
}
```

**Formato legado (`RequestBody`):**
```json
{
  "RequestBody": {
    "TransactionType": "RECEIVEPIX",
    "TransactionId": 761679887,
    "Amount": 8000.00,
    "EndToEndId": "E1393589320230727130301498341234",
    "transactionIdentification": "topup-empresaA-camp1",
    "transactionIdBRCode": "761678748",
    "InitiationType": "DYNAMIC_QRCODE",
    "StatusCode": { "Description": "confirmed", "StatusId": 2 }
  }
}
```

- `transactionIdentification` / `transactionIdBRCode` ligam o webhook ao QR criado.
- **Responda HTTP 200** para a Celcoin parar de reenviar (ver §6).

---

## 4. FLUXO C — Cash-out: payout para o recipient (o coração do Perkly)

Caminho mais comum: recipient cadastrou uma **chave PIX** (self-service). Então: consulta DICT → pagamento por chave (`initiationType: DICT`).

### 4.1 (Passo B) Consultar DICT para resolver a chave

**Request — `GET /pix/v1/dict/v2/key/{chave}`** (ex.: `.../baas/v2/pix/dict/entry/external/{chave}`)

**Response (campos que importam):** retorna dados bancários do dono da chave + um **`endToEndId`** que você **obrigatoriamente** reutiliza no pagamento.
```json
{
  "account": { "branch": "0001", "accountNumber": "207173170", "accountType": "CACC" },
  "participant": "30306294",
  "owner": { "taxIdNumber": "22774707838", "type": "NATURAL_PERSON", "name": "Maria Recipient" },
  "endtoend": "E3030629420200808185300887639654"
}
```

> ⚠️ **Política de baldes e fichas (DICT):** cada consulta bem-sucedida consome **1 ficha**; cada cash-out com sucesso **repõe 1 ficha**; uma busca com erro (400/404) consome **20 fichas**. Reposição fixa: **2 fichas/min (PF)** ou **10 fichas/min (PJ)**. Balde zerado → **HTTP 429** e DICT bloqueado até repor. **Para payout em massa isto é um gargalo de design:** cacheie a resolução de chave por recipient, evite re-consultar a mesma chave dentro de um lote, e trate 429 com backoff.

### 4.2 (Passo C) Iniciar o pagamento — `POST /baas/v2/pix/payment`

O `clientCode` é a **sua chave de idempotência no provider**. Gere determinístico e persista a *intent* no ledger **antes** desta chamada (persist-intent-before-PSP).

**Request (por chave / DICT):**
```json
{
  "amount": 25.55,
  "clientCode": "payout-camp1-recipient42-uuid",
  "endToEndId": "E3030629420200808185300887639654",
  "initiationType": "DICT",
  "paymentType": "IMMEDIATE",
  "urgency": "HIGH",
  "transactionType": "TRANSFER",
  "debitParty": { "account": "444444" },
  "creditParty": {
    "bank": "30306294",
    "key": "chave-pix-do-recipient",
    "name": "Maria Recipient",
    "accountType": "CACC"
  },
  "remittanceInformation": "Recompensa Campanha 1"
}
```

Variações de `initiationType`:
- `DICT` — pagamento por chave PIX (exige `endToEndId` do DICT). **Principal caso do Perkly.**
- `MANUAL` — pagamento por agência/conta (sem DICT; `creditParty` com `bank/branch/account/taxId`).
- `DYNAMIC_QRCODE` / `STATIC_QRCODE` — pagamento de QR (menos relevante para payout).

**Response síncrono:**
```json
{
  "transactionId": 9162909,
  "clientCode": "payout-camp1-recipient42-uuid",
  "endToEndId": "E1393589320220307125800721814129",
  "status": "PROCESSING",
  "code": "SUCCESS"
}
```

**Campo `code` — tratamento de idempotência:**

| `code` | Significado | Ação no Perkly |
|---|---|---|
| `SUCCESS` | Aceito; aguardar webhook | Mantém intent em `PROCESSING` |
| `SUCCESSFUL_WITH_ERROR` | Pago, mas falhou só o comprovante | Idem; tratar como sucesso |
| `ALREADY_PAID` | Já pago antes (mesmo `clientCode` **ou** `endToEndId`) | **Não pague de novo.** Reconcilie a intent existente |
| `ALREADY_PAYD_WITH_ERROR` | Já pago antes, com erro de comprovante | Idem `ALREADY_PAID` |

> Esse é o ponto-chave: **idempotência em duas camadas** = sua constraint de unicidade no DB (intent) **+** o `clientCode` no provider. Num retry após timeout de rede, mesmo que sua intent não tenha persistido, a Celcoin te devolve `ALREADY_PAID` e evita o pagamento duplo.

> **Saldo otimista + estorno:** ao chamar `payment`, a Celcoin **debita a conta bolsão na hora**. Se a transferência falhar, ela **devolve o saldo** e te avisa por webhook. Sua state machine precisa modelar: `PENDING → DEBIT_RESERVED → (CONFIRMED | FAILED→REVERSED)`.

### 4.3 (Passo C) Webhook de confirmação — `pix-payment-out`

**Formato novo (`entity`):**
```json
{
  "entity": "pix-payment-out",
  "createTimestamp": "2023-07-27T10:03:31.233+00:00",
  "status": "CONFIRMED",
  "body": {
    "amount": 25.55,
    "oldBalance": 8050.00,
    "currentBalance": 8024.45,
    "clientCode": "payout-camp1-recipient42-uuid",
    "id": "7d89772a-6fbe-4cbf-a3c3-fc7f31aa63c9",
    "endToEndId": "E1393589320230727130301498341234",
    "initiationType": "DICT",
    "transactionType": "TRANSFER",
    "urgency": "HIGH",
    "paymentType": "IMMEDIATE",
    "debitParty": {
      "taxId": "13935893000109", "name": "Perkly",
      "branch": 1, "account": 300123, "accountType": "TRAN"
    },
    "creditParty": {
      "bank": 30306294, "taxId": "22774707838", "name": "Maria Recipient",
      "branch": 1, "account": 207173170, "accountType": "CACC"
    }
  }
}
```

**Formato legado (`RequestBody`):**
```json
{
  "RequestBody": {
    "TransactionType": "PAYMENT",
    "TransactionTypePix": "TRANSFER",
    "ClientCode": "payout-camp1-recipient42-uuid",
    "EndToEndId": "E1393589320230727130301498341234",
    "TransactionId": 9162909,
    "InitiationType": "DICT",
    "PaymentType": "IMMEDIATE",
    "Urgency": "HIGH",
    "StatusCode": { "Description": "confirmed", "StatusId": 2 }
  }
}
```

**Valores de `StatusId` (formato legado):** `0` INITIATED · `1` PROCESSING · `2` CONFIRMED · `3` ERROR.
**Valores de `status` (formato novo):** `CONFIRMED` / `ERROR` (+ `PROCESSING`).

> Regra de ouro: **`StatusId == 2` (ou `status == CONFIRMED`) = sucesso.** Qualquer outra coisa, tratar e reconciliar. Responder **HTTP 200** sempre.

### 4.4 (Passo D) Consulta de status — contingência

Use só como fallback (timeout 5xx, webhook atrasado). Status válido **~20s após** a resposta de sucesso do payment; janela de **8 dias**.

**Request — `GET /baas/v2/pix/payment/status?id={id}&endtoendId={e2e}&clientCode={cc}`** (informar ao menos um).
**Response:**
```json
{
  "transactionId": 9162909,
  "clientCode": "payout-camp1-recipient42-uuid",
  "endToEndId": "E1393589320220307125800721814129",
  "status": "CONFIRMED",
  "error": null
}
```
Status: `1` PROCESSING · `2` CONFIRMED · `3` ERROR (detalhe no nó `error`).

> Recomendação da própria Celcoin: se deu **5xx** no payment mas o status está `PROCESSING`, **não cancele** — aguarde o webhook. Cancelar pode corromper a integração.

---

## 5. FLUXO E — Devoluções (reversals)

Há dois sentidos. Não confundir:

### 5.1 `pix-reversal-in` — um PAYOUT nosso voltou

Ocorre quando recebemos de volta o valor de um pagamento que **fizemos** (recipient/PSP devolveu). Re-credita a conta bolsão → você re-credita a campanha no ledger.

```json
{
  "entity": "pix-reversal-in",
  "createTimestamp": "2023-07-27T11:17:57.783+00:00",
  "status": "CONFIRMED",
  "body": {
    "amount": 40.97,
    "oldBalance": 10.00,
    "id": "8a18df09-5155-4397-acc1-3dc61df1d151",
    "reason": "MD06",
    "originalClientCode": "payout-camp1-recipient42-uuid",
    "returnIdentification": "D10573521202307271417gUTeaw9DZC4",
    "originalId": "092294bc-7cc1-4575-811a-1191e7e315f0",
    "originalEndToEndId": "E1393589320230727130301498341234"
  }
}
```
Legado equivalente: `TransactionType: "REVERTED"`, com `OriginalEndToEndId`, `TransactionIdPayment` (ref. ao pagamento original) e `TransactionId` (id da devolução).

### 5.2 Devolver um CASH-IN que recebemos + `pix-reversal-out`

Fluxo **obrigatório** por regulação: o sistema deve permitir devolver um PIX recebido (parcial ou total, em até 90 dias). Dispara após `pix-payment-in`.

**Request — `POST .../v1/pix/reverse`:**
```json
{
  "amount": 25.55,
  "clientCode": "reversal-empresaA-uuid",
  "endToEndId": "E3030629420200808185300887639654",
  "reason": "MD06",
  "reversalDescription": "Estorno de aporte"
}
```
**Confirmação via webhook `pix-reversal-out`:**
```json
{
  "entity": "pix-reversal-out",
  "createTimestamp": "2023-07-27T10:46:30.360+00:00",
  "status": "CONFIRMED",
  "body": {
    "amount": 250.00,
    "oldBalance": 50.00,
    "currentBalance": 6.52,
    "id": "b94150c9-7dad-4b21-8183-50c83f4c5dd8",
    "clientCode": "reversal-empresaA-uuid",
    "reason": "MD06",
    "returnIdentification": "D13935893202307271346SPpDyb4f123",
    "originalEndToEndId": "E1393589320230727130301498341234",
    "originalPaymentId": "4d22dea5-5507-45dd-9126-c6be307e6208"
  }
}
```

---

## 6. Configuração e operação dos webhooks

- **Cadastro:** via suporte (BASIC AUTH: url + user + senha) **ou** via API com token JWT (`registerWithToken`), passando `url`, `url_token`, `client_id`, `client_secret`, `grant_type`, `token_field`.
- **Resposta esperada:** **sempre HTTP 200.** Sem 200, a notificação fica `Pendente` e é reenviada.
- **Política de retry / bloqueio:**
  - **> 20 tentativas** numa mesma transação → **transação bloqueada** (para de notificar).
  - **> 50 tentativas** de um mesmo evento → **evento bloqueado**.
  - Desbloqueio: automático ao reenviar, ou manual via `POST /webhook-manager-webservice/v1/webhook/{EVENTO}` (por transação, com `transactionsToResend[]`, ou por evento com `dateFrom`/`dateTo`, janela ≤ 1 dia).
- **Consulta de pendências/bloqueios:** API de webhook com `dateFrom`/`dateTo`, paginação `limit`/`start` (máx 100 por página), `onlyPending=true`.

> **Implicação para o handler:** ele tem que ser **idempotente e rápido** (responder 200 e processar async, ou processar e responder 200 dentro do timeout). Use `id` / `endToEndId` / `clientCode` como chave de dedupe — a Celcoin **vai** reentregar o mesmo evento.

---

## 7. Matriz de identificadores (idempotência & conciliação)

| Identificador | Quem gera | Onde aparece | Papel no Perkly |
|---|---|---|---|
| `clientCode` | **Você** (no cash-out) | request `payment` + webhook out + status | Idempotency key do payout; dedupe; casa webhook↔intent |
| `clientRequestId` | **Você** (no cash-in dinâmico) | request brcode + webhook in | Âncora de conciliação do aporte (empresa/campanha) |
| `transactionIdentification` | **Você** (no QR estático) | request brcode + webhook in | Idem para QR estático |
| `endToEndId` (E2E) | **BACEN/Celcoin** | DICT + payment + webhooks | Identificador canônico da transação PIX no arranjo |
| `transactionId` (Celcoin) | **Celcoin** | response + webhooks | Id interno Celcoin; usar em consultas/contingência |
| `returnIdentification` | **Celcoin** | webhooks de reversal | Identificador da devolução (E2E da devolução) |

Regra prática: **toda intent no seu ledger guarda `clientCode`/`clientRequestId` (seu) + `endToEndId` + `transactionId` (deles).** A conciliação noturna cruza Σ ledger lógico vs. saldo/extrato físico da Celcoin por esses campos.

---

## 8. Máquina de estados sugerida (payout)

```
                 persist intent (clientCode)
   [CREATED] ───────────────────────────────► [PENDING]
                                                   │
                          POST /pix/payment        │
                 ┌─────────────────────────────────┤
                 │ code=ALREADY_PAID                │ code=SUCCESS
                 ▼                                  ▼
          [RECONCILE_EXISTING]              [DEBIT_RESERVED]
                                                   │
                          webhook pix-payment-out  │
                 ┌─────────────────────────────────┤
                 │ status=ERROR (saldo devolvido)   │ status=CONFIRMED
                 ▼                                  ▼
            [REVERSED] ◄── webhook              [CONFIRMED]
                          pix-reversal-in
                          (devolução do recipient)
```

- Transições **só** por evento idempotente.
- `cron sweep` varre intents presas em `PENDING`/`DEBIT_RESERVED` além do SLA e chama o endpoint de status (§4.4) como contingência.
- Outbox garante que o crédito/débito no ledger e o efeito colateral (notificar recipient) não divirjam.

---

## 9. Checklist de implementação do `CelcoinPaymentRail`

- [ ] `TokenProvider` com cache + refresh proativo (margem antes de `expires_in`); mTLS + IP allowlist em produção.
- [ ] Mapeamento `code` do payment → estados internos (`ALREADY_PAID` ⇒ reconciliar, nunca repagar).
- [ ] Geração determinística de `clientCode` e `clientRequestId` carregando empresa/campanha.
- [ ] Cache de resolução DICT por recipient + tratamento de **429** (baldes/fichas) com backoff.
- [ ] Webhook handler idempotente: dedupe por `endToEndId`/`clientCode`, responde **200**, processa async.
- [ ] Suporte aos **dois formatos** de payload (`entity` novo e `RequestBody` legado) ou confirmação de qual está ativo.
- [ ] Validação `amount` do webhook ↔ valor esperado **antes** de creditar (cash-in).
- [ ] State machine de payout com estorno via `pix-payment-out status=ERROR` e re-crédito via `pix-reversal-in`.
- [ ] Fluxo obrigatório de devolução de cash-in (`/pix/reverse` + `pix-reversal-out`).
- [ ] Conciliação periódica Σ ledger lógico vs. saldo físico Celcoin.
- [ ] Testes de sandbox cobrindo: sucesso (`StatusId:2`), rejeição (chave `66486782000129` / payload de erro documentado), reentrega de webhook, retry com mesmo `clientCode`.

---

## 10. Atalho de estudo

A Celcoin publica um índice machine-readable para agentes em **`https://developers.celcoin.com.br/llms.txt`** (todas as páginas em Markdown + endpoints em OpenAPI). Puxe isso direto para o seu fluxo de spec em vez de navegar página a página.

---

### Ressalvas

- Endpoints e nomes de campo conferidos na doc pública da Celcoin (sandbox `openfinance.celcoin.dev`). Caminhos exatos de algumas rotas (`/pix/v1/brcode/dynamic` vs. fluxo location+cobrança em 2 etapas; rota precisa do DICT) variam por versão (v1/v2) — **valide contra a sua credencial e o OpenAPI no momento da integração.**
- Detalhes operacionais (chave PIX da conta, mTLS, allowlist, formato de webhook ativo, scopes) dependem da homologação da sua conta e do time de suporte.
- Valores monetários: a doc usa decimal nos exemplos. **No seu ledger, continue em `bigint` cents** e converta só na fronteira do adapter.