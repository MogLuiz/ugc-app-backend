# External Integrations

## Authentication

**Service:** Supabase Auth
**Purpose:** Autenticação de usuários (signup, login, JWT)
**Implementation:** `src/auth/guards/supabase-auth.guard.ts` — valida JWT via `supabase.auth.getUser(token)`
**Configuration:** `SUPABASE_URL`, `SUPABASE_ANON_KEY` (env)
**Authentication:** JWT Bearer no header `Authorization`

## Storage

**Service:** Supabase Storage
**Purpose:** Armazenamento de avatares de usuário
**Implementation:** `src/uploads/uploads.service.ts` — upload para bucket `avatars`
**Configuration:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (service role para write)
**Bucket:** `avatars` — path `{userId}/profile-{timestamp}.{ext}`

## Database

**Service:** PostgreSQL
**Purpose:** Persistência de usuários e perfis
**Implementation:** TypeORM com entities em `src/**/entities/*.entity.ts`
**Configuration:** `DATABASE_URL` ou `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
**SSL:** Habilitado quando `DB_HOST` contém `supabase.co`

## API Integrations

### Frontend

**Purpose:** Consumidor da API REST
**Location:** CORS configurado em `main.ts` para `localhost:5173` e `FRONTEND_URL`
**Authentication:** Bearer token do Supabase no header
**Key endpoints:** `/auth/me`, `/users/bootstrap`, `/profiles/me`, `/uploads/avatar`, `/health`

## Webhooks

Não utilizado.

## Background Jobs

Não utilizado.
