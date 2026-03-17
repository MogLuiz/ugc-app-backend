# .agents – Skills centralizadas do projeto

Esta pasta concentra todas as skills utilizadas pelos agentes de IA (Cursor, Claude Code, Windsurf) no projeto.

## Estrutura

```
.agents/
├── README.md           # Esta documentação
├── .skill-lock.json    # Registro das skills instaladas (opcional)
└── skills/             # Skills disponíveis no projeto
    └── tlc-spec-driven/
        ├── SKILL.md    # Instruções para o agente
        ├── README.md  # Documentação da skill
        └── references/# Referências carregadas sob demanda
```

## Skills instaladas

| Skill | Descrição |
|-------|-----------|
| [tlc-spec-driven](skills/tlc-spec-driven/) | Spec-Driven Development: Specify → Design → Tasks → Implement+Validate |

## Como usar

O Cursor encontra as skills através de **symlinks** em `backend/.cursor/skills/` e `frontend/.cursor/skills/` que apontam para esta pasta. O conteúdo real fica apenas aqui em `.agents/skills/`.

## Adicionar novas skills

1. Crie uma pasta em `skills/[nome-da-skill]/`
2. Adicione o `SKILL.md` com as instruções para o agente
3. Inclua referências em `references/` conforme necessário
4. Atualize esta documentação
