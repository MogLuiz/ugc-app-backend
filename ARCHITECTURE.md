# Arquitetura do Backend UGC

## Estrutura de Pastas

```
src/
├── app.module.ts
├── main.ts
│
├── common/                    # Utilitários compartilhados
│   ├── decorators/
│   │   └── current-user.decorator.ts
│   ├── enums/
│   │   ├── user-role.enum.ts
│   │   ├── user-status.enum.ts
│   │   ├── document-type.enum.ts
│   │   └── slot-status.enum.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   └── interfaces/
│       └── jwt-payload.interface.ts
│
├── config/                    # Configuração e validação de env
│   ├── config.module.ts
│   └── env.validation.ts
│
├── database/                  # TypeORM e migrations
│   ├── data-source.ts
│   ├── migrations/
│   └── seeds/
│       ├── run-seed.ts
│       └── tags.seed.ts
│
├── auth/                      # Autenticação via Supabase JWT
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── guards/
│   │   └── supabase-auth.guard.ts
│   └── dto/
│
├── users/                     # Usuários e bootstrap
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   ├── users.repository.ts
│   ├── entities/
│   │   └── user.entity.ts
│   └── dto/
│
├── profiles/                  # Perfis base e específicos
│   ├── profiles.module.ts
│   ├── profiles.controller.ts
│   ├── profiles.service.ts
│   ├── entities/
│   │   ├── profile.entity.ts
│   │   ├── creator-profile.entity.ts
│   │   └── company-profile.entity.ts
│   └── dto/
│
├── tags/                      # Tags e creator_tags
│   ├── tags.module.ts
│   ├── tags.service.ts
│   ├── entities/
│   │   └── tag.entity.ts
│   └── dto/
│
├── availability/              # Slots de disponibilidade
│   ├── availability.module.ts
│   ├── availability.service.ts
│   ├── entities/
│   │   └── creator-availability-slot.entity.ts
│   └── dto/
│
├── uploads/                   # Upload para Supabase Storage
│   ├── uploads.module.ts
│   ├── uploads.controller.ts
│   ├── uploads.service.ts
│   └── dto/
│
└── health/                    # Healthcheck
    ├── health.module.ts
    └── health.controller.ts
```

## Dependências Principais

| Pacote | Uso |
|--------|-----|
| @nestjs/core, common, platform-express | Framework base |
| @nestjs/config | Configuração e validação de env |
| @nestjs/swagger | Documentação API (opcional para MVP) |
| typeorm + pg | ORM e driver PostgreSQL |
| @supabase/supabase-js | Validação JWT e Storage |
| class-validator, class-transformer | Validação e transformação de DTOs |

## Fluxo de Autenticação

1. Frontend: usuário faz login via Supabase Auth
2. Frontend: recebe access_token (JWT)
3. Frontend: chama POST /users/bootstrap com Bearer token
4. Backend: valida JWT via Supabase (getUser)
5. Backend: cria ou retorna user + profiles
6. Rotas protegidas: AuthGuard valida token em cada request

## Decisões de MVP

- **synchronize: false** — migrations explícitas para produção
- **Repository pattern** — encapsula acesso a dados, facilita testes
- **Bootstrap idempotente** — evita duplicação por retries
- **Upload avatar** — validação de tamanho e mime type no backend
- **RBAC preparado** — role em users, guard extensível para futuras permissões
