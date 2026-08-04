# Skills deste projeto

Skills do Claude Code ficam em `.claude/skills/<nome-do-skill>/SKILL.md`. Cada
pasta é um skill; o nome da pasta deve bater com o `name` usado para invocar
via `/<nome-do-skill>`.

## Formato de um SKILL.md

```
---
name: nome-do-skill
description: Frase objetiva de quando usar este skill (decide se ele é oferecido como relevante para uma tarefa).
---

Instruções do skill em markdown. Isso substitui o comportamento padrão do
Claude para a tarefa descrita — escreva como um procedimento pro Claude
seguir, não como documentação de referência pra humano.
```

Campos de frontmatter:

- `name` (obrigatório): igual ao nome da pasta, kebab-case.
- `description` (obrigatório): usada tanto pra decidir relevância quanto
  exibida na listagem de skills disponíveis — seja específico sobre quando
  usar (e, se fizer sentido, quando não usar).
- `allowed-tools` (opcional): lista separada por vírgula restringindo quais
  ferramentas o skill pode usar quando invocado.

Arquivos extras dentro da pasta do skill (scripts, templates, referências)
podem ser lidos sob demanda pelas instruções do SKILL.md via caminho
relativo — não precisam ir tudo dentro do próprio SKILL.md.

## Exemplo

Veja [`example-skill/SKILL.md`](example-skill/SKILL.md) — copie a pasta,
renomeie (pasta + campo `name`), escreva o procedimento real, e apague o
exemplo quando não precisar mais dele de referência.
