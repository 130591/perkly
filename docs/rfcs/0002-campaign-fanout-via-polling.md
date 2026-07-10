# RFC 0002 — Fan-out da campanha por varredura de estado, não por evento

- **Status:** aceito
- **Data:** 2026-07-10
- **Contexto de código:** `backend/src/campaign/`
- **Supersede:** RFC 0001, Decisão 4 (publicação do `CampaignActivated` após o
  commit) e o hop `campaign → fanout` via fila `campaign-activated`. O restante
  da 0001 (páginas, idempotência por `pageId`, inbox `payout_page`, porta de
  eventos do payout) continua valendo.

---

## Problema

Na 0001, o `confirm()` reserva o saldo e publica um evento magro
`CampaignActivated` via `runOnTransactionCommit`; o `CampaignFanoutConsumer`
assina esse evento e pagina a campanha. A própria 0001 (Decisão 4) admitiu a
janela: **processo cai entre o commit e o `send` ⇒ campanha ativada sem
fan-out**, e apontou *outbox* como a solução forte, adiada.

Ao detalhar essa falha, o custo mostrou-se pior do que "um evento perdido":

- **Campanha-zumbi.** Depois do commit, a campanha está `active` e o saldo do
  cliente está **travado em `reserved`**. Sem o fan-out, nenhum payout é criado,
  nenhum recipient recebe link, e o saldo fica preso **sem compensação**.
- **Sem caminho de recuperação.** `activate()` tem guard de status
  (`campaign is not draft`), então re-`confirm` **lança**. O único produtor do
  evento se perdeu e **não há como reproduzi-lo pela API**.
- **Silenciosa.** O HTTP já respondeu 200. No melhor caso há um log (falha do
  `send`); no pior (crash entre commit e callback) não há nem log.

A pergunta desta RFC: existe algo **com menos furos que um cron reconciliador**,
mas **mais simples que um outbox**?

---

## Diagnóstico: o evento era um ponteiro puro

`CampaignActivated` carregava `campaignId, accountId, occurredAt`. A primeira
coisa que o consumidor fazia era **reler tudo do banco**
(`findWithBatches`). O evento não transportava **nenhum estado** que não
estivesse durável no banco no instante do commit — só um sinal "acorde e olhe a
campanha X".

Isso é um smell de DRY no sentido do guia (`.claude/CLAUDE.md`): "esta campanha
está ativa e precisa de fan-out" é **um** conhecimento, escrito em **dois**
lugares — `status='active'` no banco **e** a mensagem na fila. Os dois podem
divergir, e a divergência *é* o zumbi.

O outbox resolve o furo **transportando o estado com garantia**. Mas aqui não há
estado a transportar — só um sinal, sobre uma linha já durável e consultável. É
um requisito *mais fraco*, e dá para atendê-lo com menos máquina.

---

## Decisões

### 1. O gatilho do fan-out é a varredura do estado durável, não um evento

Apaga-se o hop `campaign-activated`. O fan-out passa a **varrer** as campanhas
que precisam dele: `status = 'active' AND fanned_out_at IS NULL`. A **linha da
campanha é a fila de trabalho**.

**Por quê:** uma campanha que commitou `active` é **garantidamente** encontrada
pela próxima varredura, porque a varredura lê a mesma linha durável. Não existe
evento a se perder — a janela commit↔send da 0001 deixa de existir. É um outbox
"degenerado" onde o **agregado é a própria linha do outbox**: o estado que iria
para uma tabela `outbox` já está na campanha.

**Troca:** barateia a corretude (zero perda, zero recuperação manual) e some
máquina (uma fila, um evento, um codec — ver "O que sai"), ao custo de
**latência**: o fan-out dispara no próximo tick (~15 s), não em milissegundos
após o `confirm`. Para mass-payout, sub-minuto é irrelevante — o recipient
recebe o link de qualquer forma. Aceito.

**Alternativa rejeitada (cron reconciliador sobre o desenho da 0001):** manter o
evento e varrer atrás de zumbis. Os furos vêm todos de **inferir** a conclusão
do fan-out por sinal alheio: "campanha `active` sem payouts" é (a) falso-positivo
por lag normal (precisa grace period), (b) query **cross-context** na tabela do
payout, e (c) **cego a falha parcial** (paginou 30 de 50 → "tem payout" → é
ignorada). Recuperação por heurística, não por verdade registrada.

### 2. Marcador `fanned_out_at` na entity (infra), não no agregado

Nova coluna `fanned_out_at timestamptz null` em `campaigns`. É estado de
**despacho assíncrono**, não invariante de negócio — fica na `CampaignEntity` +
repositório, o agregado `Campaign` (lifecycle: draft/active/closed/canceled;
dinheiro: `total()`) **não muda**.

**Por quê:** o domínio é o núcleo estável; bookkeeping de entrega é volátil e não
deve poluí-lo. Mesma lógica do inbox `payout_page` da 0001, que também é infra.

### 3. Marca-se `fanned_out_at` DEPOIS de publicar as páginas, no mesmo commit

Dentro de uma transação: reivindica a campanha → publica todas as páginas em
`payout-batch-requested` → grava `fanned_out_at`. Ordem importa.

**Por quê (crash-safety):** o `send` ao SQS acontece **dentro** da tx, antes de a
marca commitar. Crash no meio ⇒ rollback ⇒ `fanned_out_at` continua NULL e as
páginas já enviadas são reprocessadas com segurança (idempotência por `pageId` da
0001, Decisão 6). **Nunca** existe o estado "marcado como fan-outed mas sem
páginas": a marca e os envios commitam juntos.

**Por que NÃO `runOnTransactionCommit` (removido, não movido):** na 0001 o
`confirm` usava `runOnTransactionCommit` para publicar o `campaign-activated`
**depois** do commit. A tentação natural é mover esse mecanismo para o worker.
Isso **reintroduziria a perda**, só um hop abaixo — as duas ordens:

```
# runOnTransactionCommit (send DEPOIS do commit) — o zumbi volta
tx: claim(lock) + markFannedOut(now) ──▶ COMMIT   (marca gravada, lock solto)
        runOnTransactionCommit ──▶ sqs.send(páginas)
        ↑ crash aqui: marca já setada → varredura nunca mais pega a campanha
                     → páginas nunca enviadas → campanha-zumbi

# como está (send DENTRO da tx, marca por último) — crash-safe
tx: claim(lock) + sqs.send(páginas) + markFannedOut(now) ──▶ COMMIT
        ↑ crash antes do commit: ROLLBACK → fanned_out_at NULL → reenvia
                     → páginas já enviadas viram no-op (pageId)
```

**A inversão de simetria (por que agora dá):** a 0001 publicava de propósito
**depois** do commit — um `send` dentro da tx que depois desse rollback (saldo
insuficiente) seria fan-out fantasma, e o gatilho `campaign-activated` **não
tinha dedup**. Publicar cedo era perigoso. Aqui é o oposto: o consumidor (payout)
**é idempotente por `pageId`**, então "enviei e a tx deu rollback" custa zero (o
reenvio é no-op). É essa idempotência a jusante que **compra o direito** de mover
o `send` para dentro da tx e **descartar** o `runOnTransactionCommit`. O antigo
não tinha essa propriedade no gatilho da campanha, por isso adiava; o novo tem,
por isso antecipa — e troca a janela de perda por crash-safety.

**Troca:** aceita **reenvio redundante** de páginas num crash pós-`send`
(deduplicado no payout, custo desprezível) em nome de zero perda.

### 4. Claim concorrente com `FOR UPDATE SKIP LOCKED`, uma campanha por transação

`claimPendingFanout()` seleciona uma campanha pendente travando a linha
(`FOR UPDATE SKIP LOCKED`). Scanners concorrentes (múltiplas instâncias) **pulam**
a linha travada em vez de reprocessá-la. Uma campanha por transação.

**Por quê:** evita trabalho duplicado sob concorrência **sem** reintroduzir
perda — a marca continua sendo gravada só ao final (Decisão 3), e o lock é
liberado no rollback, então um crash devolve a campanha à fila.

**Troca:** o lock é mantido **enquanto as páginas são enviadas ao SQS** (I/O sob
transação — um smell no *request path*, mas aqui é um worker de despacho cujo
trabalho É esse). Bounded a uma campanha; `SKIP LOCKED` garante que ninguém
espera. Aceito. Mesmo sem o lock o resultado seria correto (idempotência), só
desperdiçaria envios; o lock é otimização de concorrência, não corretude.

### 5. Agendamento por `setInterval` no ciclo de vida, sem nova dependência

O `CampaignFanoutWorker` liga um `setInterval` em `onApplicationBootstrap` e o
limpa em `onModuleDestroy`. Um guard (`running`) evita sobreposição; `.unref()`
não segura o processo. **Em `test` o loop não liga** — igual aos pollers de SQS
(o harness boota o AppModule inteiro; scanner de fundo = open handles/ruído em
CI). O fluxo é exercido por teste dedicado chamando `drain()` à mão.

**Por quê:** `@nestjs/schedule` resolveria, mas é dependência nova + wiring
(`ScheduleModule.forRoot()`) para um único loop. `setInterval` em hooks é
autossuficiente e fecha o furo do "desligar em test" com um `if`. KISS: a peça
mais simples é a que não existe.

### 6. O hop `fanout → payout` continua via SQS

`payout-batch-requested` permanece uma fila. **Aqui há estado real a
transportar** — as páginas de recipients — e ele se beneficia de paralelismo,
retry por página e DLQ (0001, Decisão 1). A varredura substitui só o hop
*sinal*, não o hop *dados*.

---

## Limite honesto (quando isto NÃO se aplica)

A varredura funciona porque `campaign` e `fanout` moram no **mesmo app/banco** e
o "próximo passo" é 100% derivável do estado durável do agregado. Quando o
consumidor for um **serviço separado** que não pode dar `SELECT` no seu banco —
o caso futuro `PayoutCreated → Claim` (0001, Decisão 8) —, o ponteiro não basta e
volta-se a precisar de **outbox + transporte de verdade**. Ferramenta certa por
hop: intra-processo → varredura da própria tabela; cross-service → outbox.

---

## O que sai e o que entra

**Sai (da 0001):**

- filas `campaign-activated` + `campaign-activated-dlq` (`elasticmq.conf`)
- `runOnTransactionCommit` + `publishActivated` no `CampaignService`
- `serializeCampaignActivated` / `parseCampaignActivated` (codec)
- tipo `CampaignActivated` (`campaign-events.ts`)
- `CAMPAIGN_ACTIVATED_QUEUE` (`queues.ts`)
- o consumer de SQS `CampaignFanoutConsumer`

**Entra:**

- coluna `fanned_out_at` em `CampaignEntity` + `claimPendingFanout()` /
  `markFannedOut()` no `CampaignRepository`
- `CampaignFanoutWorker` (varredura agendada) no lugar do consumer
- `CampaignService.confirm` só reserva + persiste `active` (sem publicar nada)

---

## Fluxo ponta a ponta (revisado)

```
POST /campaign/:id/confirm
        │  @Transactional: activate() + reserva saldo + status='active'
        ▼  (commit — nada é publicado)
   campanha durável: status='active', fanned_out_at=NULL
        ┊
        ┊  CampaignFanoutWorker (setInterval, ~15s)
        ▼
   @Transactional por campanha:
     claimPendingFanout()  ── FOR UPDATE SKIP LOCKED
        │  fatia batches em páginas de 500 → publica cada uma
        │  markFannedOut()  ── mesma tx, POR ÚLTIMO
        ▼
   [payout-batch-requested]  ── PayoutBatchRequested (pageId, campaignId, ...)
        ▼
   CreatePayoutConsumer (payout) — inalterado (claimPage → idempotente)
        ▼
   (Claim — futuro)
```

---

## Adiado (dívida consciente)

- **Recipients como linhas** (não `jsonb` inline) — herdado da 0001, Decisão 5.
- **Publisher real de eventos** (SQS) quando o Claim assinar `PayoutCreated`, e
  **outbox** nesse hop cross-service (ver "Limite honesto").
- **Schema em produção:** a coluna `fanned_out_at` chega via `DB_SYNCHRONIZE` nos
  testes; produção ainda não tem sistema de migração (nada do contexto está
  deployado).
