# Architecture

**Pattern:** Modular monolith (NestJS modules)

## High-Level Structure

```
┌─────────────────────────────────────────────────────────────┐
│                        AppModule                             │
├─────────┬─────────┬─────────┬─────────┬─────────┬──────────┤
│ Config  │Database │  Auth   │  Users  │Profiles │ Uploads  │
│ Module  │ Module  │ Module  │ Module  │ Module  │  Module  │
└─────────┴─────────┴─────────┴─────────┴─────────┴──────────┘
                              │
                    ┌─────────┴─────────┐
                    │   Health Module    │
                    └───────────────────┘
```

## Identified Patterns

### Module-per-Domain

**Location:** `src/*/` (auth, users, profiles, uploads, health, database, config)
**Purpose:** Separação por domínio de negócio
**Implementation:** Cada pasta = um NestJS @Module com controller, service e DTOs
**Example:** `src/profiles/profiles.module.ts`, `profiles.controller.ts`, `profiles.service.ts`

### Repository Pattern (parcial)

**Location:** `src/users/users.repository.ts`
**Purpose:** Abstrair acesso a dados com queries customizadas
**Implementation:** `UsersRepository` com `findByAuthUserIdWithProfiles` usando TypeORM
**Example:** `UsersService` injeta `UsersRepository` em vez de `Repository<User>` diretamente

### Guard-based Auth

**Location:** `src/auth/guards/supabase-auth.guard.ts`
**Purpose:** Validar JWT do Supabase em rotas protegidas
**Implementation:** `SupabaseAuthGuard` implementa `CanActivate`, valida Bearer token, injeta `AuthUser` no request
**Example:** `@UseGuards(SupabaseAuthGuard)` em controllers

### Decorator for Current User

**Location:** `src/common/decorators/current-user.decorator.ts`
**Purpose:** Extrair usuário autenticado do request
**Implementation:** `@CurrentUser()` lê `request.user` definido pelo guard

## Data Flow

### Authentication Flow

```
Frontend (Supabase Auth) → JWT
    → Request: Authorization: Bearer <token>
    → SupabaseAuthGuard: supabase.auth.getUser(token)
    → request.user = AuthUser { authUserId, email, role }
    → Controller: @CurrentUser() user
```

### User Bootstrap Flow

```
POST /users/bootstrap (auth required)
    → UsersService.bootstrap(authUserId, email, role)
    → Cria User + Profile + CreatorProfile ou CompanyProfile
    → Retorna payload completo com perfis
```

### Profile Update Flow

```
PATCH /profiles/me (auth required)
    → ProfilesService.updateProfile(authUserId, dto)
    → Busca User via UsersRepository
    → Atualiza Profile, CreatorProfile ou CompanyProfile conforme role
```

### Avatar Upload Flow

```
POST /uploads/avatar (auth required, multipart)
    → UploadsService.uploadAvatar(userId, buffer, mimetype)
    → Valida MIME e tamanho
    → Supabase Storage: avatars/{userId}/profile-{timestamp}.{ext}
    → ProfilesService.updatePhotoUrl
```

## Code Organization

**Approach:** Feature-based (cada domínio em sua pasta)

**Structure:**
- `src/common/` — decorators, interfaces, enums compartilhados
- `src/config/` — validação de env
- `src/database/` — TypeORM, migrations
- `src/auth/` — guards, controller de auth
- `src/users/` — users, bootstrap
- `src/profiles/` — profiles, creator, company
- `src/uploads/` — upload de avatar
- `src/health/` — health check

**Module boundaries:** Cada módulo exporta apenas o necessário; dependências via imports no AppModule.
