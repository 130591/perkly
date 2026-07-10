# RFC 0001 — Fan-out de Payouts a partir da ativação da campanha

- **Status:** aceito (implementado, não commitado)
- **Data:** 2026-07-10
- **Contexto de código:** `backend/src/payout/`, `backend/src/campaign/`
- **Relacionado:** padrão `settle → wallet` (evento + codec + fila), que este RFC espelha

---

## Problema

Ao confirmar uma campanha (`POST /campaign/:id/confirm`), cada recipient de cada
batch precisa virar um `Payout` (proto-resgate à espera do usuário). Uma campanha
pode ter **dezenas de milhares** de recipients. Como transformar isso em payouts
de forma assíncrona, resiliente e sem acoplar os contextos `campaign` e `payout`?

Cada decisão abaixo declara a troca no estilo do guia de design
(`.claude/CLAUDE.md`): *barateia a mudança X ao encarecer a mudança Y*.

---

## Decisões

### 1. Fan-out em páginas (Shape B), não um evento gordo

O evento de ativação **não** carrega os recipients. Um worker de fan-out pagina
a campanha e emite uma mensagem por **página** de recipients.

**Por quê:** um único evento com todos os recipients é inviável, não só feio:
- **Limite duro do SQS:** 256 KB por mensagem. Dezenas de milhares de recipients
  estouram isso — não é "fica grande", é "não entrega".
- **Granularidade de retry:** uma mensagem é a unidade de reentrega. Um recipient
  envenenado levaria a campanha inteira pra DLQ, reprocessando os que já deram
  certo.
- **Paralelismo:** um consumer processaria o bloco todo sozinho, numa transação
  gigante. Páginas dão N mensagens pequenas, N consumers, retry isolado.

**Troca:** barateia escala e resiliência (páginas independentes) ao custo de uma
2ª fila e um passo de fan-out. Aceito.

**Alternativa rejeitada (Shape A — payout puxa via port de leitura):** uma fila
só, mas um consumer faz o trabalho todo (sem paralelismo) e o payout passa a
depender de um port de leitura do campaign. Menos código, pior escala.

### 2. O contrato do evento é do produtor (campaign), não do consumidor

`CampaignActivated` e `PayoutBatchRequested` + o codec + os nomes de fila vivem
em `campaign/` (`campaign-events.ts`, `campaign-events.codec.ts`, `queues.ts`).
O `payout` importa. Campaign **não conhece** payout.

**Por quê:** direção de dependência aponta pra estabilidade. Espelha
`settle → wallet` (o settle é dono de `CashInConfirmed`; o wallet assina). O
consumidor definir o formato do produtor inverte a seta.

**Troca:** barateia trocar/evoluir o consumidor sem tocar no produtor; encarece
mudar o contrato (mexe no dono, em `campaign/`). Correto.

### 3. Na fila trafega o UUID, nunca o id numérico

`campaignId` no evento é o `external_id` (UUID), não o `id` `bigint` interno.

**Por quê:** regra do codebase — o id numérico é só para joins/índices e jamais
cruza uma fronteira (API, URL, fila).

### 4. Publicação **depois** do commit

`confirm()` é `@Transactional`. O `CampaignActivated` é publicado via
`runOnTransactionCommit`, só após o commit. Falha no `send` é logada, não
relançada (a resposta HTTP não deve falhar — a campanha já está ativada).

**Por quê:** publicar dentro da transação é I/O externo numa tx de banco (smell
do guia). Se a tx desse rollback, teríamos fan-out de campanha não-ativada.

**Troca:** barateia a consistência comum (rollback ⇒ nada enfileirado) ao custo
de uma janela rara: processo cai **entre** commit e send ⇒ campanha ativada sem
fan-out. Mitigado por retry/monitoração; a solução forte é **outbox** (ver
Adiado).

### 5. Paginação em memória, por batch; página de 500

Recipients são gravados como `jsonb` inline no `BatchEntity` (não são linhas
próprias). Então o worker carrega a campanha e **fatia o array de cada batch**
em memória, em páginas de 500.

**Por quê:** não dá para `LIMIT/OFFSET` de recipients — eles não são linhas. E o
`confirm()` já materializa tudo em memória para reservar o saldo, então o custo
de memória já é pago antes do SQS.

**Troca:** barateia o "agora" (zero mudança de schema) assumindo **muitos batches
modestos**. Encarece o caso "um batch com dezenas de milhares", que vira uma
coluna `jsonb` gigante — aí o certo é promover recipient a linha (ver Adiado).

### 6. Idempotência por página, via inbox (`payout_page`)

SQS é at-least-once. `createFromBatch` primeiro **reivindica** a página
(`PayoutRepository.claimPage(pageId)` = `INSERT ... ON CONFLICT DO NOTHING
RETURNING`); se já foi processada, no-op. Claim + inserts na mesma transação.
`pageId = ${batchId}:${índice}`.

**Por quê:** reprocessar não pode duplicar **nem payouts nem eventos**. O claim
por página inteira garante que uma reentrega gere zero inserts e zero
`PayoutCreated`.

**Alternativa rejeitada (chave sintética na linha do payout + `ON CONFLICT`):**
sem tabela extra, mas (a) vaza a fronteira de mensageria pra dentro da tabela de
domínio e (b) o `ON CONFLICT` pula a linha em silêncio enquanto o
`events.publish` do loop **ainda dispara** → eventos duplicados.

**Troca:** barateia a corretude sob reentrega/concorrência (o índice único
serializa) ao custo de uma tabela-inbox. Aceito.

### 7. URLs de fila no formato AWS real

O config largou o `queueUrl` único (hardcoded pro `cash-in`); agora tem
`accountId` + o derivador `queueUrl(sqs, nome) = ${endpoint}/${accountId}/${nome}`
— mesmo formato da AWS (`https://sqs.<region>.amazonaws.com/<acct>/<fila>`) e do
ElasticMQ. Uma fila nova é só um nome.

**Por quê:** o modelo antigo não generalizava para múltiplas filas. Preferimos o
formato que funciona em AWS real desde já, a uma gambiarra de dev.

### 8. Eventos de domínio via porta abstrata

`payout` expõe `DomainEventPublisher` (classe abstrata) + `PayoutCreated`. A impl
concreta atual (`LoggingDomainEventPublisher`) só loga — placeholder até o
contexto **Claim** existir e assinar. Troca por SQS depois sem tocar no service.

**Por quê:** nada de domínio conhece o transporte; o service depende só da porta.

---

## Fluxo ponta a ponta

```
POST /campaign/:id/confirm
        │  reserva saldo (wallet, via BALANCE_RESERVATION)
        │  runOnTransactionCommit ─┐  (depois do commit)
        ▼                          ▼
   [campaign-activated]  ── CampaignActivated (magro: campaignId, accountId, occurredAt)
        ▼
   CampaignFanoutConsumer (campaign)
        │  carrega campanha, fatia batches em páginas de 500
        ▼
   [payout-batch-requested]  ── PayoutBatchRequested (pageId, campaignId, linksExpireAt, recipients[])
        ▼
   CreatePayoutConsumer (payout)
        │  claimPage(pageId) → idempotente
        │  cria Payouts + publica PayoutCreated (porta DomainEventPublisher)
        ▼
   (Claim — futuro)
```

Ambas as filas têm DLQ com `maxReceiveCount = 5` (`elasticmq.conf`).

---

## Adiado (dívida consciente)

- **Outbox** para garantia forte de entrega do `CampaignActivated` (fecha a
  janela commit↔send da Decisão 4).
- **Recipients como linhas** (não `jsonb` inline) quando um único batch puder ter
  dezenas de milhares — permite paginação real no banco (Decisão 5).
- **Publisher real de eventos** (SQS) quando o contexto Claim assinar
  `PayoutCreated` (Decisão 8).
- **Desacoplar tipos:** o domínio do payout importa `Recipient`/`Channel` de
  `campaign/batch` (cross-context). Poderia ter os próprios tipos ou reusar
  `PayoutRecipient` do contrato que já consome.
