# RFC 0006 — Notificação: envio assíncrono multi-canal

- **Status:** rascunho — as 6 decisões estruturais estão fechadas (ver
  "Pontos em aberto"); falta detalhar retry/DLQ e a mecânica de
  `idempotencyKey` por produtor antes de virar "proposto"
- **Data:** 2026-08-05
- **Contexto de código:** novo `backend/src/notification/`; produtores em
  `identity/service/{tenant-provisioning,password-recovery,membership}.ts` e
  `claim/`
- **Relacionado:** RFC 0002 (precedente publish-dentro-da-tx vs. varredura —
  relevante pra Decisão 5), RFC 0004/0005 (identity, guards)

---

## Problema

Três TODOs nomeados em `identity/` apontam pro mesmo módulo inexistente:

- `tenant-provisioning.ts:61-62` — e-mail de ativação de conta
- `password-recovery.ts:42-43` — e-mail de recuperação de senha
- `membership.ts:50-51` — e-mail de convite de membro

E um quarto caso, sem TODO — um buraco silencioso, não uma dívida nomeada: a
jornada do destinatário em `docs/project.md` começa em "Receber notificação"
→ abrir link → informar chave PIX. `claim/` já está todo construído (consome
`PayoutCreated`, expõe o link, tem estados `pending/claimed/expired`), mas
**nada dispara o envio desse link pro destinatário**.

São dois consumidores de formato diferente — e-mail transacional pra um
usuário Perkly conhecido (`identity`) vs. entrega pra alguém sem conta, no
canal que a campanha escolheu por ele (`claim`, via `Channel` em
`campaign/domain/batch.ts`: `email | phone`) — mas a pergunta estrutural é a
mesma nos dois: como um produtor pede "envie isto" sem acoplar seu commit ao
sucesso de um provider externo, e sem reabrir uma janela de perda que o
projeto já fechou uma vez (RFC 0002, fan-out da campanha).

Cada decisão abaixo é apresentada como opções com a troca nomeada
(`.claude/CLAUDE.md`: *barateia X ao encarecer Y*), não como algo já
resolvido — é para discutirmos com calma antes de fechar.

---

## Decisões encaminhadas

### Construir em casa, não adotar Novu

Consideramos usar o Novu (plataforma open-source de notificação —
`workflowIdentifier` + `to` + `payload`, exatamente o padrão de
"chamador não conhece o template" que discutimos abaixo). Descartado por
custo de infra, não por falta de encaixe conceitual: self-host do Novu
entra com **seis serviços novos** (API, Worker, WebSocket, Dashboard,
MongoDB, Redis) — um banco de dados diferente do resto do sistema (Mongo
vs. Postgres) e mais quatro processos pra manter no ar. Novu Cloud (SaaS)
evitaria essa infra, mas passa dados de destinatário (e-mail/telefone dos
recipients do payout) por um terceiro e cria dependência de uptime/preço
externo.

**Troca:** barateia manter uma stack só (Postgres, o mesmo estilo de fila
que já existe) e não expor PII de destinatário a um vendor, ao custo de
construir e manter na mão o que o Novu já resolve pronto (templates com
editor, 60+ providers, retry, subscriber/preferências) — aceito
conscientemente, sem essas features.

### Vocabulário do discriminador: `reason` do produtor, não `template` do notification

Ponto que veio de uma objeção real: se o campo fosse `template:
'claim-link'`, o chamador estaria nomeando um conceito que pertence ao
*renderer* do notification (implementação alheia) — inverte a direção de
dependência (`.claude/CLAUDE.md`: dependência aponta pro estável).
Renomeando para `reason` (o fato do domínio do próprio produtor —
`'claim-link-ready'`, `'password-reset-requested'`) o notification nunca
precisa saber que esse nome existe até o produtor publicar; ele só decide
*como* renderizar aquele fato, não *se* ele existe. O `novu.trigger(workflowId,
{ to, payload })` documentado usa exatamente essa separação (o chamador só
sabe o identifier, nunca o conteúdo do workflow) — não inventamos algo
sem precedente.

**Resolução de `reason → render` por enquanto:** um `switch` exaustivo
dentro do próprio `notification/core`, tipado por uma union fechada de
`reason`s. `context` de cada `reason` também é declarado dentro de
`notification/core` (ver Camada 1 abaixo) — quem renderiza e envia é quem
decide o que precisa receber. Produtores importam o tipo *de*
`notification`, nunca o contrário: a direção de dependência já nasce
correta, sem a dívida "stable→volatile" que tínhamos cogitado antes.

**Gatilho de migração documentado:** no dia em que uma segunda pessoa/time
precisar adicionar um `reason` sem poder tocar `notification/`, trocar o
switch por um registry de templates via DI (`multi provider` do Nest,
mesmo padrão de `PAYMENT_RAIL`/`BALANCE_RESERVATION`). Nesse momento o
tipo do `context` migraria junto pro módulo produtor, como parte do mesmo
refactor — hoje não, porque não há segundo time.

Fecha a Decisão 4 abaixo.

---

## Camada 1 — API de entrada (`Notifier.send`)

Construindo de baixo pra cima: primeiro a assinatura que os produtores
chamam, antes de decidir o que acontece por trás dela (fila, provider,
crash-safety — camadas seguintes).

```ts
export type NotificationRequest =
  | { reason: 'claim-link-ready'; idempotencyKey: string; recipient: Channel; context: { name: string; amountCents: string; link: string } }
  | { reason: 'tenant-activation'; idempotencyKey: string; recipient: Channel; context: { name: string; activationLink: string } }
  | { reason: 'member-invited'; idempotencyKey: string; recipient: Channel; context: { name: string; inviteLink: string; tenantName: string } }
  | { reason: 'password-reset-requested'; idempotencyKey: string; recipient: Channel; context: { name: string; resetLink: string } }

export interface Notifier {
  send(request: NotificationRequest): Promise<void>
}
export const NOTIFIER = Symbol('NOTIFIER')
```

**`idempotencyKey` é opaco pro `notification`** — só usado pra dedup
(`(reason, idempotencyKey)` único, ver Decisão 5). Quem gera e o que
significa é decisão do produtor, não modelada aqui: identifica uma
**ocorrência de disparo**, não a entidade. Pra `claim-link-ready` hoje,
entidade e ocorrência coincidem (`claimId`, dispara uma vez na vida do
claim) — mas isso não é regra geral, é só o caso de hoje. Ações que podem
disparar o mesmo `reason` mais de uma vez pra mesma entidade (ex: reenviar
o link do claim, no roadmap) precisam de uma chave nova por tentativa,
não a chave da entidade reusada — senão a segunda tentativa vira no-op
por engano. Mecânica de geração fica pro produtor decidir quando a
funcionalidade existir; `notification` só exige que o campo exista.

Interface + `Symbol` como token, não `abstract class` — mesmo idioma de
`PaymentRail`/`PAYMENT_RAIL` (`settle/payment-rail.ts:56-62`), não o
`DomainEventPublisher` (`abstract class`) que o payout usa pra evento. O
projeto já tem os dois estilos; este port é mais parecido com "chamar uma
integração externa" (payment rail) do que com "publicar evento de
domínio", então segue o primeiro.

**`Channel` sai de `campaign/domain/batch.ts` para um local neutro**
(proposta: `shared/domain/channel.ts`) — decidido nesta conversa. Motivo:
com `notification` como terceiro consumidor (depois de `campaign` e
`claim`), `campaign` deixa de ser "dono" do conceito, só foi quem
precisou primeiro. `Recipient` (nome + valor + canal) continua em
`campaign/domain/batch.ts` — esse sim é vocabulário específico de payout,
não genérico. *Ainda não movido no código — registrado aqui como decisão
de definição; execução fica pra quando sairmos do modo RFC.*

**Decidido:** `context` de cada `reason` é declarado dentro do próprio
`notification/core`, ao lado do `reason` — quem renderiza e envia (`Notifier`)
é quem define o contrato de entrada. `claim`/`identity` importam
`NotificationRequest` (ou o branch específico da union) de `notification`
pra montar a chamada; `notification` não importa nada de volta. Direção de
dependência convencional: produtor depende do port que consome, não o
contrário.

---

## Camada 2 — Router: despacho por canal (sem regras, por enquanto)

Simples de propósito: `Notifier.send` despacha por `recipient.type` — sem
fallback entre canais, sem seleção de provider por regra de negócio, sem
prioridade/urgência. `Channel` já é união fechada (`email | phone`), então
o `switch` é exaustivo — o compilador acusa se um canal novo aparecer sem
`case`.

```ts
export interface EmailProvider {
  send(address: string, content: EmailContent): Promise<void>
}
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER')

export interface WhatsAppProvider {
  send(number: string, content: WhatsAppContent): Promise<void>
}
export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER')

class NotifierImpl implements Notifier {
  constructor(
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider,
  ) {}

  async send(request: NotificationRequest): Promise<void> {
    switch (request.recipient.type) {
      case 'email':
        return this.email.send(request.recipient.address, renderEmail(request))
      case 'phone':
        return this.whatsapp.send(request.recipient.number, renderWhatsApp(request))
    }
  }
}
```

`renderEmail`/`renderWhatsApp` são dois `switch(request.reason)` — formatos
de saída diferentes por canal (e-mail: `{ subject, html }`; WhatsApp:
`{ templateName, params }`, já que Business API/BSP normalmente exige
template pré-aprovado, não texto livre — ver Decisão 6).

**Adiado conscientemente, não esquecido** (surgiu discutindo um
`router-rules` de outro projeto): fallback entre canais, escolha entre
múltiplos providers do mesmo canal, override de canal por `reason`,
prioridade/urgência. Nenhum desses está modelado hoje. **Por que é seguro
adiar:** o `switch` inteiro vive atrás de `Notifier.send(request)` — nenhum
caller (`claim`, `identity`) enxerga o roteamento por dentro. Trocar o
`switch` por uma tabela de regras depois é refactor interno, contido em um
arquivo, mesma assinatura pública — mesmo argumento já usado pra adiar o
registry de templates (reason → render, decisão acima).

---

## Pontos em aberto

### 1. Um módulo — RESOLVIDO (Opção A)

Confirmado: `notification` como bounded context único, `identity` e
`claim` chamam a mesma porta. Já era a premissa de todo o desenho das
Camadas 1/2.

### 2. Canais — RESOLVIDO (Opção B)

E-mail + telefone (WhatsApp), os dois via Twilio (Decisão 6). Cobre o
`Channel` inteiro que a `Campaign` já aceita hoje — nenhum recipient fica
sem caminho de entrega.

### 3. Gatilho — RESOLVIDO na Camada 2

Assíncrono via fila, confirmado: `Notifier.send` publica na fila do canal
(`notification-email`/`notification-whatsapp`) dentro da mesma
`@Transactional()` do produtor — Opção B original, detalhado na Camada 2.

### 4. Forma do evento — RESOLVIDO na Camada 1

Nem "genérico solto" nem "um evento por produtor": `reason` como union
fechada (vocabulário do produtor, não do notification), `context` tipado
por `reason` mas **declarado dentro de `notification/core`** — ver Camada
1 e a seção "Vocabulário do discriminador" acima. Uma fila por canal (não
por `reason`), então o "Custo: mais filas" da Opção B original não se
aplica — o fan-out por fila é por canal, o fan-out por `reason` é só um
`switch` dentro do consumer daquele canal.

### 5. Crash-safety — RESOLVIDO (Opção A + dedup concreto)

Publish dentro da `@Transactional()` do produtor, mesmo padrão do
`PayoutCreated`. O dedup que a Opção A exigia está fechado: unique
`(reason, idempotency_key)` no consumer de cada fila, com `idempotencyKey`
opaco fornecido pelo produtor — ver Camada 1. `Opção B` (coluna
`notified_at` + varredura) descartada: mais peça nova sem necessidade,
dado que o dedup por chave já cobre o caso.

### 6. Provider — RESOLVIDO (Opção B), Twilio

Provider real desde já, via Twilio para os dois canais: WhatsApp
(Programmable Messaging) e e-mail (SendGrid, também Twilio) — um vendor
só, duas credenciais/SDKs distintos por trás de `EmailProvider` e
`WhatsAppProvider`.

---

## Ainda não mapeado (levantar quando as opções acima começarem a fechar)

- **Adiado, não decidir agora:** números de retry/DLQ por fila (`maxReceiveCount`,
  visibility timeout, etc). Configuração da fila, não da API/contrato — muda
  sem afetar nenhum caller nem o shape do `NotificationRequest`, mesmo
  argumento de "seguro adiar" já usado na Camada 2.
- `docs/project.md` não lista Notification entre os Bounded Contexts hoje —
  como o desenho todo até aqui já assume módulo único (Decisão 1, Opção A),
  vale confirmar isso explicitamente e então atualizar lá.
- ~~Mecânica de geração do `idempotencyKey` por `reason`~~ — RESOLVIDO: regra
  única pros quatro. `idempotencyKey` = `externalId` da linha criada na
  mesma transação que decide notificar (todas as entidades envolvidas
  estendem `DefaultEntity`, que já dá `externalId`):
  - `claim-link-ready` → `claim.externalId` (ou `payoutId`)
  - `tenant-activation` → `activation.externalId` (`tenant-provisioning.ts:55-59`)
  - `password-reset-requested` → `reset.externalId` (`password-recovery.ts:37-41`)
  - `member-invited` → `invitation.externalId` (`membership.ts:42-48`)

  Resolve o caso de resend de graça: as três entidades de `identity` já são
  criadas via `.create(...)` a cada chamada (`password-recovery.ts` já roda
  isso a cada "esqueci a senha", sem guard) — um resend futuro (reenviar
  convite/ativação) seguiria o mesmo padrão, gerando `externalId` novo
  automaticamente. Nenhum `reason` precisa de mecânica própria.
