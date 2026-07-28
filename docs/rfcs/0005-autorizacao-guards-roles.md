# RFC 0005 — Autorização: verificação de token, roles e guards

- **Status:** proposto
- **Data:** 2026-07-28
- **Contexto de código:** `backend/src/identity/` (guard global de JWT —
  novo), `backend/src/wallet/`, `backend/src/campaign/`, `backend/src/claim/`
  (rotas passam a exigir token por padrão), `backend/src/main.ts` (registro
  do guard global)
- **Relacionado:** RFC 0004 (Decisão 9 — dívida nomeada: rotas de negócio
  sem guard até esta RFC existir)

---

## Problema

Hoje, qualquer request pra `POST /wallet/:accountId/charge`,
`GET /wallet/:accountId/balance`, `POST /campaign`, `POST /campaign/:id/confirm`,
`GET /claims/:claimId` ou `POST /claims/:claimId/pix-key` passa **sem
nenhuma verificação de identidade** — o token que a RFC 0004 emite (Decisão
4) nunca é validado em request algum fora do próprio `identity`. E tem uma
camada mais funda: mesmo validando "o token é de um usuário real", nada
hoje impede que o usuário da conta A acesse `/wallet/:accountId/charge`
passando o `accountId` da conta **B** na URL — é exatamente essa lacuna que
abriu o Problema original da RFC 0004 e ficou nomeada como dívida na
Decisão 9.

A pergunta desta RFC: como transformar "tenho um JWT válido" em "esta ação,
neste recurso, é permitida pra este chamador" — cobrindo três camadas
empilhadas, cada uma com decisão própria:

1. **Autenticação de request** — verificar assinatura/expiração do JWT e
   extrair `{ accountId, userId, role }` de forma reutilizável entre
   `wallet`/`campaign`/`claim`.
2. **Isolamento entre contas** — garantir que o `accountId` do token bate
   com o recurso sendo acessado (a vulnerabilidade original que motivou
   toda essa história).
3. **Autorização por papel** — decidir o que cada `role` (`ADMIN`/`MEMBER`)
   pode fazer, e onde essa regra vive (decorator por rota, lista central,
   outra coisa).

Cada decisão abaixo declara a troca no estilo do guia de design
(`.claude/CLAUDE.md`): *barateia a mudança X ao encarecer a mudança Y*.

---

## Decisões

### 1. Guard global (opt-out), não guard por rota (opt-in)

`app.useGlobalGuards(...)` no `main.ts` — toda rota exige token válido por
padrão. Rotas que devem ficar públicas (webhook do Celcoin, `backoffice/tenants`,
`login`, `refresh`, os fluxos de convite/reset por token, e **todo o
`ClaimController`**) ganham um decorator `@Public()`, que o guard checa
antes de exigir o token.

`claims` é público **de propósito**, não por descuido: é o fluxo do
destinatário do payout — alguém sem conta Perkly, cujo único "credencial" é
a posse do link (`ClaimController` já documenta isso). Autenticar essas
rotas não faria sentido — não existe usuário Perkly do outro lado.

**Por quê:** o modo opt-in (`@UseGuards` por rota, igual `BackofficeGuard`
hoje) tem uma fragilidade estrutural: toda rota nova nasce desprotegida por
padrão, e depende de alguém lembrar de adicionar o guard antes de expor
aquilo de verdade. Isso é normal num sistema em construção incremental — as
rotas de `wallet`/`campaign`/`claim` não têm guard hoje pela mesma razão que
não têm vários outros pedaços ainda: o projeto nunca foi pra produção e
está sendo montado peça por peça. O ponto desta RFC é fechar isso **antes**
de qualquer coisa ser exposta de verdade, não corrigir algo que já vazou.
Opt-out inverte o ônus daqui pra frente: esquecer de marcar `@Public()` não
abre brecha, o padrão já nasce seguro.

**Alternativa rejeitada (guard por rota, opt-in):** mais explícito rota a
rota, mas exige lembrança perfeita em toda rota nova, para sempre — o
mesmo padrão que já levou `wallet`/`campaign`/`claim` a ficarem sem guard
até agora, simplesmente porque ninguém tinha chegado nessa parte ainda.
Não corrige a causa raiz (fácil esquecer), só descreve o sintoma.

**Troca:** barateia o caso que dói (rota nova já nasce protegida, sem
depender de ninguém lembrar) ao custo de precisar auditar/marcar
`@Public()` em cada rota que hoje é intencionalmente aberta, e o guard
global fica um pouco mais esperto (precisa checar a exceção via metadata
antes de exigir o token).

### 2. Verificação via `@nestjs/passport` + `passport-jwt`, não guard próprio

`AuthGuard('jwt')` do Nest, com uma `JwtStrategy` (`passport-jwt`) que lê o
`Authorization: Bearer`, verifica e devolve `{ accountId, userId, role })`
como `req.user`. Diferente de `WebhookGuard`/`BackofficeGuard` (que são
`CanActivate` na mão, sem passport) — aqui é o padrão "oficial" do
ecossistema Nest.

**Por quê:** a lib já cobre de fábrica boa parte do checklist do OWASP
abaixo (fixação de algoritmo, extração do header, erro genérico em caso de
falha) — não é reinventar verificação de token pra um caso onde o padrão da
comunidade já é maduro e amplamente auditado.

**Alternativa rejeitada (guard próprio com `JwtService.verifyAsync`):**
consistente com `WebhookGuard`/`BackofficeGuard`, zero dependência nova,
mas exige acertar na mão cada item do checklist OWASP (fixação de
algoritmo, mensagens genéricas) — superfície pequena, mas é
responsabilidade extra sem necessidade, dado que `passport-jwt` já resolve.

**Troca:** barateia usar um mecanismo testado e mantido pela comunidade
(menos chance de erro sutil de segurança) ao custo de duas dependências
novas (`@nestjs/passport`, `passport-jwt`) e uma camada de indireção
(`Strategy` + `PassportModule`) que nenhum outro guard do projeto usa —
primeira exceção deliberada ao padrão "guard na mão" existente.

**Checklist OWASP que a configuração da `JwtStrategy` precisa cumprir**
(RFC 0004, Decisão 4, e JWT Cheat Sheet da OWASP):

1. **Algoritmo fixado explicitamente** (`algorithms: ['HS256']` nas opções
   da strategy) — nunca confiar no `alg` que vem dentro do token. Sem isso
   existe o ataque clássico de confusão de algoritmo.
2. **Resposta genérica sempre** — 401 "Unauthorized" independente do
   motivo real (expirado, assinatura inválida, malformado); detalhe só no
   log do servidor.
3. **Token via header `Authorization: Bearer`** (`ExtractJwt.fromAuthHeaderAsBearerToken()`),
   não cookie — o access token já nasce pra isso (Decisão 4: corpo da
   resposta, front guarda em memória).
4. **Sem checagem de revogação dentro da strategy** — a Decisão 4 já
   fechou "sem blacklist"; a defesa contra token roubado continua sendo
   TTL curto + step-up, não uma consulta a mais aqui.
5. **HS256 simétrico é proporcional por enquanto** — só migraria pra RS256
   (assimétrico) se um dia existir um verificador que não pode ter o
   segredo de assinatura (outro serviço, fora do monólito). Nomeado como
   limite, não resolvido agora — ver "Limite honesto".

### 3. `accountId` só vem do token — nunca de URL, body ou query

`wallet` perde `:accountId` da URL (`POST /wallet/:accountId/charge` vira
`POST /wallet/charge`, idem `GET /wallet/balance`); os services passam a
receber o `accountId` que o controller extrai de `req.user`, nunca de um
parâmetro que o cliente controla. `CampaignBody.accountId` é **removido**
do DTO — hoje é campo do corpo da requisição, ou seja, qualquer chamador
podia criar campanha pra qualquer conta só preenchendo o UUID que quisesse;
`CampaignController.create` passa a montar o `CampaignDraft` com
`req.user.accountId`, não com o que veio no JSON.

`CampaignService.confirm(id)` ganha o parâmetro do chamador e verifica
posse: `campaign.accountId !== callerAccountId` → `NotFoundException`, não
`ForbiddenException`. Mesmo princípio se aplica a qualquer rota futura que
carregue um id de recurso (não de conta) na URL.

**Por quê:** a Decisão anterior (RFC 0004, Problema) nomeou exatamente essa
lacuna — "nenhuma garantia de que quem está chamando tem o direito de agir
em nome daquela conta". Tirar `accountId` de qualquer entrada controlada
pelo cliente elimina a classe inteira do bug de uma vez: não existe mais
"esqueceu de comparar" porque não existe mais nada pra comparar — o dado
nunca chega de fora.

**Por quê `NotFoundException`, não `ForbiddenException`, no caso do
recurso-por-id:** devolver 403 confirmaria pro chamador que aquele
`campaignId` **existe**, só que é de outra conta — vaza informação sobre
contas alheias. 404 é indistinguível de "esse id nunca existiu", que é a
resposta certa do ponto de vista de quem não tem nada a ver com aquele
recurso.

**Alternativa rejeitada (manter `:accountId` na URL/body, checar contra o
token):** mudança menor agora (só adiciona uma comparação), mas exige
lembrar de checar em **toda** rota que recebe algo parecido com accountId —
exatamente o problema de "guard opt-in" que a Decisão 1 já rejeitou, só que
aplicado a dados em vez de rotas. E não cobre o caso `campaign`/`claim`
(id de recurso, não de conta) sem uma segunda checagem por resource.

**Troca:** barateia a corretude (não tem o que esquecer) ao custo de mudar
assinatura de rota e contrato de API já existentes (`wallet`) — cliente que
já integrou com `/wallet/:accountId/charge` precisa se adaptar. Como nada
está em produção ainda, aceito sem ressalvas.

### 4. Autorização por papel: decorator `@Roles()` + `RolesGuard`, permissivo por padrão

`@Roles('ADMIN')` na rota; um `RolesGuard` (roda depois do `AuthGuard('jwt')`
da Decisão 2) lê a metadata via `Reflector` e compara com `req.user.role`.
Sem `@Roles()` numa rota, qualquer role autenticado passa — diferente da
Decisão 1 (opt-out), aqui o padrão é permissivo, opt-in pra restringir.

**Matriz de hoje:**

- **`ADMIN`-only:** convidar membro (`POST /identity/tenants/:tenantId/invitations`),
  adicionar saldo (`POST /wallet/charge`), confirmar campanha
  (`POST /campaign/:id/confirm`).
- **`ADMIN` + `MEMBER`:** todo o resto (ver saldo, criar rascunho de campanha).

**Por quê essas três e não outras:** cada uma, sozinha, ou move dinheiro de
verdade (adicionar saldo; confirmar campanha reserva saldo e dispara o
fan-out de payouts — RFC 0002) ou dá a alguém novo acesso à conta (convidar
membro). Ver saldo e rascunhar campanha não movem nada — só a confirmação
move — então não têm o mesmo risco.

**Por quê permissivo por padrão, ao contrário da Decisão 1:** esquecer a
autenticação em si (Decisão 1) exporia **qualquer** dado de **qualquer**
conta pra **qualquer um**, se isso chegasse a produção assim — catastrófico
o bastante pra justificar um padrão que não deixa esquecer. Esquecer um
`@Roles()` numa rota nova é um risco de outra ordem: só significa que um
`MEMBER` da **própria** conta faz algo que talvez devesse ser só do
`ADMIN` — não vaza nada de ninguém de fora, não justifica exigir decorator
em toda rota só pra não esquecer uma diferença de UX dentro da mesma
empresa.

**Alternativa rejeitada (tabela central de permissões):** um único arquivo
listando "ação X exige role Y", checado via serviço explícito em vez de
decorator+guard. Mais fácil de auditar tudo de uma vez, mas é infraestrutura
a mais pra três rotas — decorator já resolve, e cresce igual se a matriz
crescer (o mesmo `@Roles()` funciona pra qualquer nova rota).

**Troca:** barateia declarar restrição só onde importa (a maioria das rotas
nem pensa em role) ao custo de: se a matriz crescer muito, o padrão
permissivo vira ruído pra auditar (sem um lugar central que liste tudo,
precisa olhar rota por rota pra saber o que é restrito). Aceito porque a
matriz de hoje é pequena — três rotas.

---

## Limite honesto (quando isto não é suficiente)

HS256 simétrico funciona porque quem assina (`identity`) e quem verifica
(`wallet`/`campaign`/`claim`) são o mesmo processo/monólito, compartilhando
o mesmo segredo com segurança. Se um dia um serviço **separado** precisar
verificar o token sem poder emiti-lo, o segredo simétrico teria que ser
distribuído a ele — motivo suficiente pra trocar por RS256 (chave privada
só em `identity`, pública em qualquer verificador) nesse momento, não antes.

---

## Em aberto

Nenhum item de arquitetura pendente — as três camadas do Problema estão
decididas (Decisões 1-2 autenticação, 3 isolamento entre contas, 4
autorização por papel). Detalhes de implementação (nome exato do decorator,
mensagens de erro, testes) ficam para a execução.
