# Project Structure

**Root:** backend/

## Directory Tree

```
backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   ├── config.module.ts
│   │   └── env.validation.ts
│   ├── database/
│   │   ├── database.module.ts
│   │   ├── data-source.ts
│   │   ├── run-migrations.ts
│   │   └── migrations/
│   │       └── 1731710000000-BootstrapSchema.ts
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   └── guards/
│   │       └── supabase-auth.guard.ts
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   ├── users.repository.ts
│   │   ├── entities/
│   │   │   └── user.entity.ts
│   │   └── dto/
│   │       └── bootstrap-user.dto.ts
│   ├── profiles/
│   │   ├── profiles.module.ts
│   │   ├── profiles.controller.ts
│   │   ├── profiles.service.ts
│   │   ├── entities/
│   │   │   ├── profile.entity.ts
│   │   │   ├── creator-profile.entity.ts
│   │   │   └── company-profile.entity.ts
│   │   └── dto/
│   │       ├── update-profile.dto.ts
│   │       ├── update-creator-profile.dto.ts
│   │       └── update-company-profile.dto.ts
│   ├── uploads/
│   │   ├── uploads.module.ts
│   │   ├── uploads.controller.ts
│   │   └── uploads.service.ts
│   ├── health/
│   │   ├── health.module.ts
│   │   └── health.controller.ts
│   └── common/
│       ├── decorators/
│       │   └── current-user.decorator.ts
│       ├── interfaces/
│       │   └── auth-user.interface.ts
│       └── enums/
│           ├── user-role.enum.ts
│           ├── user-status.enum.ts
│           └── document-type.enum.ts
├── docs/
├── dist/
├── package.json
├── tsconfig.json
└── .specs/
```

## Module Organization

### config
**Purpose:** Validação de variáveis de ambiente
**Location:** `src/config/`
**Key files:** `env.validation.ts`, `config.module.ts`

### database
**Purpose:** TypeORM, migrations, conexão PostgreSQL
**Location:** `src/database/`
**Key files:** `data-source.ts`, `database.module.ts`, `migrations/`

### auth
**Purpose:** Autenticação via Supabase JWT
**Location:** `src/auth/`
**Key files:** `supabase-auth.guard.ts`, `auth.controller.ts`

### users
**Purpose:** Bootstrap de usuário (criação após signup)
**Location:** `src/users/`
**Key files:** `users.service.ts`, `users.repository.ts`, `user.entity.ts`

### profiles
**Purpose:** Perfis (base, criador, empresa)
**Location:** `src/profiles/`
**Key files:** `profiles.service.ts`, `profile.entity.ts`, `creator-profile.entity.ts`, `company-profile.entity.ts`

### uploads
**Purpose:** Upload de avatar para Supabase Storage
**Location:** `src/uploads/`
**Key files:** `uploads.service.ts`, `uploads.controller.ts`

### health
**Purpose:** Health check da API
**Location:** `src/health/`
**Key files:** `health.controller.ts`

## Where Things Live

**Autenticação:**
- Guard: `src/auth/guards/supabase-auth.guard.ts`
- Interface: `src/common/interfaces/auth-user.interface.ts`
- Decorator: `src/common/decorators/current-user.decorator.ts`

**Usuários e perfis:**
- Entities: `src/users/entities/`, `src/profiles/entities/`
- Business logic: `src/users/users.service.ts`, `src/profiles/profiles.service.ts`
- API: `src/users/users.controller.ts`, `src/profiles/profiles.controller.ts`

**Upload:**
- Service: `src/uploads/uploads.service.ts`
- Controller: `src/uploads/uploads.controller.ts`
- Storage: Supabase bucket `avatars`

**Configuração:**
- Env: `src/config/env.validation.ts`
- Migrations: `src/database/migrations/`

## Special Directories

**common/**
**Purpose:** Código compartilhado entre módulos
**Examples:** `AuthUser`, `CurrentUser`, `UserRole`, `UserStatus`

**docs/**
**Purpose:** Documentação do projeto (ex: FRONTEND_INTEGRACAO.md)
