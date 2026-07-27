# RFC 0004 — Cadastro de tenant e autenticação (login, tokens, recuperação de senha)

- **Status:** proposto
- **Data:** 2026-07-27
- **Contexto de código:** `backend/src/identity/` (novo — dono de `accounts`, usuários,
  credenciais), `backend/src/wallet/` (`account_id` em `WalletEntity` perde o
  relacionamento de ORM com `AccountEntity`)
- **Relacionado:** RFC 0005 (roles, guards, decorators de autorização) — a ser
  escrita depois desta; separada porque autorização é um eixo de mudança
  diferente de autenticação (pode evoluir — políticas mais ricas — sem tocar em
  como o token é emitido)

---

## Problema

Hoje `AccountEntity` (`backend/src/wallet/database/entities/account.entity.ts`)
é uma casca vazia: só `id` interno e `external_id`. Nada no código cria uma
account a partir de uma empresa real — quem faz isso hoje é seed/teste, direto
no banco. Não existe usuário, não existe senha, não existe sessão: qualquer
`accountId` que chega em wallet/campaign/payout é um UUID que "já existia", sem
nenhuma garantia de que quem está chamando tem o direito de agir em nome
daquela conta.

A pergunta desta RFC: como uma empresa nasce no sistema (cadastro → vira a
`account`, que já existe), como o primeiro usuário administrador é criado junto
(não pode haver account sem pelo menos um dono), e como esse usuário prova quem
é em cada request subsequente — dado que há duas tensões em aberto, cada uma
com trade-off próprio ainda a decidir:

1. **Access token stateless (JWT autocontido) vs. sessão com estado no
   Postgres** (revogável a qualquer momento, ao custo de I/O em todo request).
2. **Refresh token com rotação a cada troca** (o antigo é invalidado no uso,
   detecta roubo por reuso) **vs. reutilizável até expirar** (mais simples, sem
   tabela de rastreio de reuso).

Cada decisão abaixo declara a troca no estilo do guia de design
(`.claude/CLAUDE.md`): *barateia a mudança X ao encarecer a mudança Y*.

---

## Decisões

### 1. Tenant é a `account` existente (1:1), não uma entidade nova

A empresa que se cadastra **vira** a `account` que já existe em `wallet` — ganha
nome, dados de cadastro — em vez de introduzir um `Tenant` novo que possuiria N
`accounts`. Um tenant, uma account, N usuários.

**Por quê:** nada no domínio hoje precisa de uma empresa com múltiplas
accounts. Introduzir essa relação agora seria modelar para um requisito
hipotético (contra o guia: "não alargue um tipo/relação além do que o código
já sabe que precisa").

**Troca:** barateia o modelo agora — zero entidade nova, zero tabela de
relação `tenant_id → account_id` — ao custo de: se uma empresa um dia precisar
de múltiplas accounts (multi-CNPJ, multi-carteira), a 1:1 vira uma migração de
dado real (separar tenant de account em linhas distintas), não só código novo.
Aceito conscientemente — reversível, mas não de graça.

### 2. `identity` é dono da tabela `accounts`; `wallet` para de importar `AccountEntity`

A tabela `accounts` passa a nascer e viver em `identity` (é lá que o cadastro
acontece). `WalletEntity.account_id` deixa de ser um `@OneToOne` para
`AccountEntity` (`wallet/database/entities/wallet.entity.ts:15-17`, hoje um
import cross-context) e vira uma coluna `uuid` opaca — do jeito que todo o
resto do código já trata `accountId` (`service.ts`, `wallet.controller.ts`:
sempre `string`, nunca a entidade).

**Por quê:** direção de dependência aponta para estabilidade. Quem cria e
possui a identidade da conta (o cadastro) é `identity`; o dado financeiro
(`wallet`) só precisa referenciar essa conta por id, igual já faz com todo o
resto. Espelha a dívida que a própria RFC 0001 já nomeou no "Adiado" (import
cross-context de tipos entre `payout` e `campaign`) — aqui a correção vem
**antes** do código existir, não depois.

**Troca:** barateia isolamento entre módulos (nenhum importa entidade do
outro; `identity` pode mudar `users`/`credentials`/`accounts` livremente sem
tocar `wallet`) ao custo de uma migração real: mover a tabela `accounts` (dado
já existente) de `wallet` para `identity`, e trocar o relacionamento de
`WalletEntity`.

### 3. `identity` expõe só `identity/client.ts` como superfície pública

Nenhum outro módulo importa entities, repositórios ou services de `identity`
diretamente. Tudo que `wallet`/`campaign`/`payout` precisam saber sobre
usuário/account/autenticação passa por um único arquivo,
`identity/client.ts`.

**Por quê:** ortogonalidade — o que varia sozinho (internals de `identity`:
como senha é hasheada, como token é validado, schema de `users`) deve poder
girar sozinho, sem forçar mudança em quem consome. Mesmo padrão da porta
abstrata `DomainEventPublisher` que `payout` já usa (RFC 0001, Decisão 8).

**Troca:** barateia trocar internals de `identity` (ex.: trocar algoritmo de
assinatura, adicionar claim, mudar TTL, trocar onde o refresh token é
persistido — ver Decisão 5) sem tocar consumidores, ao custo de manter
`client.ts` deliberadamente pequeno e estável — toda nova capability exposta é
uma mudança de contrato pensada, não um import direto de conveniência.

### 4. Tensão 1 resolvida: sem blacklist de access token — TTL curto + step-up nas ações sensíveis

Access token continua JWT puro, sem nenhuma checagem de estado em request
algum — nenhuma blacklist. A janela de exposição de um token roubado é
limitada pela TTL curta (15 min), não zerada.

Ações financeiras sensíveis (ex.: confirmar envio de um lote de payout) exigem
**step-up authentication** (senha/PIN transacional) no momento da ação — a
defesa contra "token roubado" não mora só na camada de token, mora também na
regra de negócio.

**Por quê:** o modelo de negócio é B2B — quem usa a API autenticada é a
empresa (poucos usuários administradores), e os destinatários finais de um
payout não têm conta, só acessam um link de uso único. O ativo caro (mover
dinheiro) já tem uma segunda barreira (step-up) independente da validade do
token. Fechar a janela do access token a zero via blacklist reintroduziria
exatamente o custo que o JWT existe para evitar — I/O de checagem em **toda**
requisição —, para neutralizar um risco cuja pior consequência já está coberta
por outro controle.

**Alternativa rejeitada (blacklist de access token via Redis):** revoga
instantaneamente, mas soma uma dependência de infra nova (Redis) só para isso
e devolve o custo de I/O por request que o design tentava evitar. Rejeitada
também porque o refresh token já precisa de um lugar para viver (é stateful
por natureza — Decisão 5) — usar blacklist além disso seria manter **dois**
mecanismos de revogação em vez de um.

**Troca:** barateia a stack (sem Redis, sem checagem em cada request) e
concentra a defesa cara numa confirmação extra só nas ações que interessam
(barato de implementar, alto valor). Aceita conscientemente uma janela de até
15 min em que um access token roubado ainda vale para ações não-sensíveis
mesmo após logout — considerado aceitável dado o perfil de risco do negócio.

### 5. Refresh token é stateful: persistido no banco, entregue via cookie `HttpOnly`

Ao contrário do access token, o refresh token **é** rastreado: fica persistido
(tabela em `identity`) e entregue ao cliente via cookie `HttpOnly` (nunca
acessível a JS no navegador). Logout apaga a linha correspondente + limpa o
cookie — bloqueia qualquer renovação futura imediatamente. O access token já
emitido continua válido até expirar sozinho (Decisão 4), mas não pode mais ser
renovado depois do logout.

**Por quê:** é o único ponto do fluxo de auth que precisa ser genuinamente
revogável de forma imediata e completa — sem ele, logout não significaria
nada (o cliente simplesmente tiraria um novo access token com o refresh
antigo). Diferente do access token, o refresh token não está no caminho
quente de toda requisição — só é consultado na troca por um novo access
token, então o custo de I/O aqui é aceitável.

**Troca:** barateia revogação real (logout funciona de verdade, imediatamente)
ao custo de manter uma tabela de sessão — o oposto do "zero estado" do JWT
puro, mas confinado a uma operação pouco frequente (renovação), não a cada
request.

### 6. Tensão 2 resolvida: rotação de refresh token com grace period

A cada troca (`POST /refresh`), o refresh token é **substituído** — não é
reutilizável. A tabela de sessões (Decisão 5) ganha as colunas que sustentam
isso:

| Coluna        | Tipo             | Papel                                                        |
|---------------|------------------|---------------------------------------------------------------|
| `token_hash`  | `varchar`        | hash do refresh token — nunca se guarda o token em texto plano |
| `expires_at`  | `timestamptz`    | expiração natural (ex.: 7 dias)                                |
| `revoked_at`  | `timestamptz?`   | preenchido no logout — invalidação explícita                   |
| `used_at`     | `timestamptz?`   | preenchido na **primeira** troca — é o que sustenta o grace period |

Fluxo em `/refresh`: hash do token recebido → busca o registro → rejeita
(401) se não existir, `revoked_at` estiver preenchido, ou `expires_at` já
passou. Daí:

- **`used_at` nulo (caminho feliz):** marca `used_at = NOW()`, insere um novo
  refresh token (nova linha, novo `expires_at`), devolve novo access token +
  novo cookie.
- **`used_at` preenchido, dentro da janela de tolerância (ex.: 30s):**
  reenvio por falha de rede do cliente — reemite a mesma resposta/par de
  tokens já gerado, sem punir o cliente por um retry legítimo.
- **`used_at` preenchido, fora da janela:** reuso de um token já trocado —
  sinal de roubo (alguém interceptou o refresh antigo e tentou usá-lo depois
  do dono já ter rotacionado). Revoga **todos** os refresh tokens ativos do
  usuário e retorna 401 — força novo login em todos os dispositivos.

**Por quê:** rotação sem grace period (invalidar o antigo no primeiro uso, sem
tolerância) tem um falso positivo comum: o cliente reenvia a mesma requisição
de `/refresh` por timeout/retry de rede antes de receber a resposta original,
e o segundo envio chega vendo o token "já usado" — um usuário legítimo é
deslogado à força por uma falha de rede, não por roubo. O grace period
distingue os dois casos pelo **tempo decorrido** desde o primeiro uso: replay
rápido (rede) vs. replay tardio (roubo real, o dono já rotacionou há muito).

**Alternativa rejeitada (invalidação estrita, sem grace period):** mais
simples (um bit `used` em vez de timestamp + janela), mas qualquer retry de
rede vira logout forçado — inaceitável para uma API que já assume clientes
sobre redes não confiáveis.

**Troca:** barateia a detecção de roubo (reuso é sinal forte, não ambíguo) e
a experiência do usuário sob falha de rede comum, ao custo de uma janela
curta (30s) em que um token reenviado por replay malicioso *rápido o
suficiente* passaria pela checagem como se fosse retry legítimo — aceito
porque a janela é pequena e o grace period é sobre repetir a **mesma**
resposta já emitida, não sobre emitir uma nova.

### 7. Três fluxos de "token por e-mail" — mecanismo compartilhado, domínio separado

Ativação do primeiro admin, aceite de convite de membro e recuperação de
senha **parecem** a mesma coisa (link de e-mail + token de uso único), mas
cada um carrega conhecimento de negócio e ciclo de vida diferentes:

- **`UserActivations`** — o usuário **já existe** (criado pelo provisionamento
  de backoffice, Decisão pendente sobre onboarding), sem senha, estado
  "pendente". Concluir define a senha e marca o usuário como ativo. Não
  revoga nada (não havia sessão).
- **`TenantInvitations`** — o usuário **não existe ainda**. O token nasce de
  uma ação de gestão interna do tenant (admin convida). Concluir **cria** o
  usuário do zero, já vinculado ao `tenant_id` correto, com a senha definida
  no aceite.
- **`PasswordResets`** — o usuário já existe e está ativo. Concluir
  **sobrescreve** a credencial e **revoga todos os refresh tokens ativos**
  (Decisão 5) — o único dos três fluxos com efeito colateral de sessão,
  porque é o único onde uma sessão comprometida é exatamente o que está sendo
  tratado.

**Por quê:** é o mesmo caso da Decisão 1 do guia sobre `Ledger.fund/reserve/
settle/expire` — forma igual (token + e-mail + expiração), conhecimento
diferente (quem já existe, quem nasce agora, o que "concluir" faz e o que
revoga). Uma tabela genérica `email_tokens` com um campo `kind` esconderia
essa diferença atrás de um `if`/`switch` dentro do mesmo agregado, em vez de
deixar cada regra evoluir e ser lida sozinha.

**O que é reaproveitado de verdade (infraestrutura, não domínio):** a função
que gera e hasheia o token aleatório (mesma técnica da Decisão 6 — nunca se
guarda o token em texto plano) e um `MailService` único que sabe montar e
disparar o e-mail a partir de um template. Isso é forma técnica compartilhável
sem custo — não é o "conhecimento" que a Decisão 1 do guia protege.

**Troca:** barateia evolução independente de cada fluxo (TTL do convite pode
mudar sem tocar reset de senha; o revoke-all do reset não vaza para
ativação/convite, que nunca deveriam ter esse efeito) ao custo de três
tabelas em vez de uma — aceito, porque a alternativa economiza uma tabela e
paga com um agregado que finge ser uma coisa só sendo três.

### 8. `role` entra em 0004 como dado (rótulo), enforcement continua 100% em 0005

`identity` ganha agora o campo `role` (enum fechado `ADMIN | MEMBER`) no
agregado de usuário — populado no provisionamento do primeiro admin
(automaticamente `ADMIN`) e escolhido pelo admin em `TenantInvitations`
(Decisão 7). Nenhum guard, decorator ou `@Roles()` é implementado nesta RFC —
o campo existe, mas nada ainda o lê para decidir acesso.

**Por quê:** "quem é essa pessoa dentro do tenant" (rótulo de identidade) e "o
que essa pessoa pode fazer por causa do rótulo" (autorização/enforcement) são
duas coisas diferentes — a primeira é dado de cadastro, a segunda é a regra
de negócio que a RFC 0005 existe para desenhar. Sem o campo agora, o convite
de membro (já especificado, já pedido pelo negócio) fica pela metade até
0005 nascer.

**Troca:** barateia entregar o convite de membro funcional já nesta RFC ao
custo de fixar a forma do campo (enum de dois valores) antes de 0005 desenhar
o modelo de autorização de verdade — se 0005 quiser algo mais rico (múltiplos
papéis por usuário, permissão por recurso), esse enum vira migração. Aceito
conscientemente: o negócio já disse que o conjunto é fechado (`ADMIN` ou
`MEMBER`), então o risco de o formato mudar é menor do que o custo de atrasar
o convite até a segunda RFC.

### 9. `identity/client.ts` fica só com lookups (`getAccountById`, `getUserById`) — proteção de rota fica para 0005

`client.ts` expõe, por ora, só leituras simples por id — nada de verificação
de token. Guard nas rotas de `wallet`/`campaign`/`payout` (bloquear acesso
cross-account checando se o token pertence à `account` do path) **fica
represado para 0005**, junto com o resto de authorization.

**Por quê:** o mesmo raciocínio da Decisão 8 (represar `role`-enforcement) —
mas aqui a dívida é mais séria e precisa ser dita sem meias-palavras: **as
rotas de `wallet` (e qualquer outro módulo) continuam, ao final desta RFC,
sem checagem de dono.** `POST /:accountId/charge` e `GET /:accountId/balance`
(`wallet.controller.ts:34-36`, `:64-66`) aceitam qualquer UUID sem validar
que o chamador tem direito sobre aquela conta — exatamente o buraco que abriu
o Problema desta RFC. Ele **não fecha** com 0004 sozinha.

**Troca:** barateia o escopo de 0004 (login, tokens, cadastro — sem
antecipar guard/decorator que são conteúdo de 0005) ao custo de: entre o
deploy de 0004 e o de 0005, o sistema autentica (sabe emitir/validar login e
token) mas não autoriza (nada usa isso para proteger uma rota de negócio).
Aceito como dívida **nomeada**, não como buraco descoberto depois — 0005
precisa ser priorizada logo em seguida, não deixada para "algum dia".

### 10. Provisionamento de tenant via endpoint interno, protegido por chave de API estática (`X-Backoffice-Token`)

Não é CLI/script rodado manualmente por alguém do time — é um **endpoint
HTTP dedicado** (ex.: `POST /identity/backoffice/tenants`) que cria a
`account`/tenant + o primeiro usuário (`UserActivations`, Decisão 7,
`role = ADMIN`) + dispara o e-mail de ativação. A autenticação não é a de
usuário comum (login/JWT) — é um segredo estático enviado no header
`X-Backoffice-Token`, comparado contra um valor guardado em variável de
ambiente/secret manager, sem sessão nem usuário associado a essa chamada.

**Por quê:** o motivo de ser endpoint HTTP e não um script de linha de
comando é justamente permitir que uma ferramenta **externa** (automação do
CRM — HubSpot, um Typeform de fechamento de contrato, ou até uma planilha com
script) dispare o provisionamento sozinha, no instante em que o contrato
fecha, sem depender de alguém do time abrir um terminal. Um CLI resolveria
"o time provisiona sem tocar no banco direto", mas não resolve "o CRM
provisiona sozinho" — que é o requisito real aqui.

**Alternativa rejeitada (CLI/script interno):** mais simples e sem expor
superfície de rede nova, mas exige um humano disparando manualmente a cada
contrato fechado — não atende à automação com o CRM, que é o ponto.

**Troca:** barateia automação de ponta a ponta (zero passo manual entre
"contrato fechado" e "conta provisionada") ao custo de um segredo estático
compartilhado como vetor de risco: não há identidade por chamador (é a mesma
chave para qualquer sistema externo autorizado), não há revogação por
integração individual (rotacionar afeta todo mundo que usa a chave), e um
vazamento permite provisionar tenants arbitrários. Aceito para o volume de
onboarding B2B esperado (poucas dezenas/centenas de contratos, não milhares
por segundo) — mitigação mínima esperada: a chave vive em secret manager
(não em código/env commitado) e o endpoint só faz uma coisa (provisionar),
nada mais.

### 11. Status do usuário é um enum fechado (`UserStatus`), não timestamp nullable

```ts
type UserStatus = 'pending_activation' | 'active' | 'disabled'
```

`pending_activation` é o estado inicial de todo usuário criado por
`UserActivations`/`TenantInvitations` (Decisão 7) até o link de definir senha
ser usado; `active` depois disso; `disabled` reservado para quando a
desativação de usuário existir.

**Por quê:** o padrão do codebase para "só um marcador de despacho" é
timestamp nullable (`fanned_out_at`, RFC 0002 Decisão 2) — mas esse padrão
serve para um **fato binário sem mais nenhum estado no horizonte**. Aqui não
é o caso: desativar usuário (e possivelmente outros estados) já está previsto
para breve. Modelar como `activated_at: timestamptz | null` agora
economizaria uma coluna hoje e custaria uma migração de schema (timestamp →
enum) assim que "disabled" precisasse existir — o inverso do que a Decisão 1
fez conscientemente para tenant/account (lá não havia nenhum estado extra
previsto; aqui há).

**Troca:** barateia adicionar `disabled` (e outros estados futuros) sem
migração de forma, só de dado, ao custo de uma coluna de enum em vez de um
timestamp que também serviria de auditoria ("quando ativou"). Quem quiser
saber "quando ativou" ainda pode adicionar `activated_at` depois, como
metadado — não é mutuamente exclusivo com o enum, só não é o campo que carrega
o estado.

### 12. TTLs por fluxo

| Fluxo | TTL |
|---|---|
| Ativação do primeiro admin (`UserActivations`) | **5 dias** |
| Convite de membro (`TenantInvitations`) | 48h (já fixado na especificação de onboarding) |
| Recuperação de senha (`PasswordResets`) | **15 minutos** |

**Por quê 5 dias e não algo mais curto para o primeiro admin:** é o único dos
três fluxos onde o destinatário não estava esperando o e-mail no mesmo
instante — não há colega de trabalho reforçando "olha teu e-mail" (caso do
convite) nem uma ação de autoatendimento que acabou de ser pedida (caso do
reset). Entre contrato fechado e alguém realmente abrir o e-mail corporativo
pode levar dias de onboarding interno do cliente.

**Por quê 15 minutos e não 1h para reset:** é uma ação de autoatendimento —
o usuário clicou "esqueci minha senha" agora e vai para a caixa de entrada
imediatamente. Uma janela curta reduz o tempo em que um e-mail interceptado
(conta de e-mail comprometida, link esquecido aberto numa aba) continua
válido, sem custo real de UX porque o caso de uso é "uso imediato" por
natureza — diferente da ativação, que espera alguém que talvez nem saiba que
o e-mail está chegando.

### 13. `wallet` é notificado da criação de account via evento SQS

`identity` publica um evento (ex.: `AccountCreated`) quando uma account
nasce; `wallet` assina para criar sua própria `wallet` row. Mesmo formato já
usado entre `campaign`/`payout` (RFC 0001) — produtor dono do contrato,
consumidor assina, UUID (`external_id`) na fila, nunca o id numérico (RFC
0001, Decisões 2 e 3).

Detalhamento (nome do evento, fila, shape exato, idempotência) fica para a
implementação — não é decisão de arquitetura pendente, é só ainda não
desenhado em detalhe.

### 14. `users.name` é nullable — o primeiro admin nasce sem nome de pessoa

O primeiro usuário (provisionado via Decisão 10) **não** tem nome de pessoa
capturado no payload de backoffice — `NewTenantBody` carrega dados da
**empresa** (nome, CNPJ) e o e-mail do admin, não o nome dele. Diferente de
`TenantInvitations` (Decisão 7 / US-07), onde o convidado preenche o próprio
nome no aceite, o primeiro admin nasce com `name = null` e fica assim até
existir uma feature de perfil (fora do escopo de 0004) que deixe a pessoa
preencher.

**Por quê:** o primeiro usuário nasce de um contrato fechado com a
**empresa**, não do recrutamento de uma pessoa específica — no momento do
provisionamento (Decisão 10), ninguém no Perkly necessariamente sabe o nome
de quem vai efetivamente logar. Preencher `name` com o nome da empresa
resolveria "sempre ter um valor", mas criaria uma mentira de modelo: uma
lista de membros do tenant mostraria a empresa como se fosse uma pessoa, ao
lado de convidados com nome de verdade (US-07). Nulo é honesto sobre o que o
sistema realmente sabe nesse momento.

**Troca:** barateia o provisionamento (Decisão 10 não precisa que o CRM
saiba/mande o nome de ninguém) e evita o dado fictício na lista de membros,
ao custo de UI ter que tolerar `name` vazio para o primeiro admin até a
pessoa preencher o próprio nome — funcionalidade de perfil que **não existe**
nesta RFC, fica como dívida nomeada.

### 15. Senha do usuário é hasheada com Argon2id, não bcrypt nem `crypto.scrypt` na mão

`user.passwordHash` é gerado com `argon2.hash()` (biblioteca `argon2`, variante
`argon2id` por padrão). Token de ativação/convite/reset continuam usando
`Token.hash` (SHA-256, Decisão 7) — são coisas diferentes: token é um
segredo aleatório de alta entropia gerado pelo sistema (SHA-256 simples já
basta, ninguém precisa adivinhar); senha é escolhida por humano, baixa
entropia, e precisa resistir a tentativa de força bruta offline caso o hash
vaze.

**Por quê Argon2id:** venceu a Password Hashing Competition (2015) e é a
recomendação nº 1 da OWASP hoje para hash de senha, à frente de bcrypt. A
vantagem prática: bcrypt só tem um fator de custo (tempo de CPU), então um
atacante com GPU/ASIC paraleliza tentativas à vontade — cada tentativa é
barata em hardware dedicado. Argon2 é **memory-hard**: o custo (tempo,
memória, paralelismo) é configurável, e a exigência de memória por tentativa
é o que encarece paralelizar em GPU (memória cara/limitada em massa, ao
contrário de ciclos de CPU). `argon2id` especificamente é o híbrido
recomendado — resiste tanto a ataque de canal lateral (como `argon2i`)
quanto a cracking por GPU (como `argon2d`).

**Alternativa rejeitada (`crypto.scrypt` nativo do Node, sem dependência
nova):** tecnicamente também memory-hard e já disponível sem instalar nada,
mas exige implementar à mão geração de salt, formato de armazenamento
(algoritmo+parâmetros+salt+hash como uma string só) e comparação em tempo
constante — exatamente o tipo de coisa que uma biblioteca madura acerta e
reimplementação improvisada erra. Diferente do regex de CNPJ/telefone (Decisão
sem número própria, mas mesma lógica: "não vale a pena uma lib pra isso"),
aqui o risco de um erro sutil (salt reusado, comparação vulnerável a timing
attack) é alto o suficiente pra preferir a biblioteca.

**Alternativa rejeitada (`bcryptjs`, pure JS, sem binário nativo):** instalaria
sem fricção nenhuma — o custo real do Argon2 apareceu aqui: `argon2` tem
binário nativo compilado por plataforma, e o ambiente de desenvolvimento
(Windows com o projeto montado via `\\wsl.localhost`) tornou a instalação não-trivial
(precisou mapear drive letter pra `cmd.exe` aceitar o diretório como
`cwd`). Aceito mesmo assim: é custo de **setup**, pago uma vez por
desenvolvedor/CI; bcrypt trocaria isso por uma fraqueza de **produção**
permanente (só custo de CPU, sem custo de memória) que não se resolve depois
sem re-hashear a base toda.

**Troca:** barateia a segurança de senha desde o início (resistente a
GPU/ASIC, parâmetros de custo ajustáveis conforme hardware de produção
crescer) ao custo de uma dependência com binário nativo — que já se provou
fricção real neste ambiente de dev, mas é dívida de setup, não de segurança.

---

## Em aberto

Nenhum item de arquitetura pendente. Detalhes de implementação (fila/evento
da Decisão 13, templates de e-mail, texto exato das telas) ficam para a
execução.

- **Feature de perfil** (editar o próprio nome, e outros dados pessoais) —
  mencionada na Decisão 14 como dívida, não tem task nem RFC própria ainda.

**Prioridade:** a Decisão 9 deixa as rotas de negócio (`wallet`/`campaign`/
`payout`) sem guard até a RFC 0005 existir — 0005 deve ser a próxima RFC a
escrever, não uma "algum dia".
