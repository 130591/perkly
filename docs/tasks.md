# Tasks — backlog para implementar depois

Itens desenhados em modelagem (pair programming) que ainda **não** foram
implementados. Cada um já tem contrato fechado; falta só escrever o código
quando chegar a hora.

---

## 1. Read-model de saldos da carteira (`GET /wallets/:accountId/balances`)

### Objetivo

A tela do app mostra três infos do cliente:

- **saldo disponível** — o que pode usar agora;
- **saldo reservado** — total que está em campanhas, **somado** (sem discriminar
  campanha a campanha; isso ficou explicitamente fora do escopo por ora);
- **saldo total** — `disponível + reservado`.

### Fonte da verdade

O **ledger** (`SUM(ledger_entries.amount)` por conta), não a coluna
`wallet.balance` — essa coluna hoje só é creditada no `fund` e nunca debitada no
`reserve`, então diverge de `available` assim que houver reserva.

A fonte já existe e está pronta: `LedgerRepository.loadBalances(accountId)`
devolve um `Snapshot` (`Partial<Record<Account, bigint>>`) com `available` e
`reserved`. **Nenhuma mudança de schema é necessária.**

### Contrato

```
GET /wallets/:accountId/balances
```

- `accountId` no path, guardado por `ParseUUIDPipe` (coluna `uuid`, mesmo padrão
  do create-charge).
- Read puro: **sem** `@Transactional()`.

Fluxo do `Wallet.getBalances(accountId)`:

1. `walletRepo.findByAccountId(accountId)` → se `null`, **404**
   `Client Wallet not found` (mesma mensagem do create-charge).
2. `ledgerRepo.loadBalances(accountId)` → `Snapshot`.
3. `available = snapshot.available ?? 0n`, `reserved = snapshot.reserved ?? 0n`,
   `total = available + reserved`.
4. devolve no shape serializável (centavos como **string** — `JSON` não aguenta
   `bigint`, mesma convenção do create-charge).

### Respostas

| Situação | Status | Corpo |
|---|---|---|
| OK (com ou sem movimentação) | 200 | `{ "available": "1500", "reserved": "500", "total": "2000" }` (zerado = `"0"`) |
| Carteira inexistente | 404 | `Client Wallet not found` |
| `accountId` não-UUID | 400 | `Validation failed (uuid is expected)` |

Chaves da resposta em inglês, neutras; "saldo disponível / reservado / total" é
rótulo de tela (i18n no app), não da API.

### Decisões registradas

- **404 vs zeros:** carteira inexistente → 404; carteira existente mas zerada →
  200 com zeros. Custa um SELECT extra (`findByAccountId`) antes do
  `loadBalances`, em troca de não devolver saldo fake para conta que não existe.
- **Sem dimensão de campanha** no ledger por enquanto — `reserved` segue como
  balde único agregado. Se um dia a tela precisar discriminar campanha a
  campanha, aí sim entra `campaign_id` na `ledger_transactions` (decisão adiada).

### Esforço

Só orquestração: um método no service + um handler no controller. Reaproveita
`findByAccountId` e `loadBalances`, ambos já existentes. Zero schema.
