# UGC — Backend

API REST em **NestJS** que centraliza regras de negócio, persistência em **PostgreSQL** (via **TypeORM**) e integração com **Supabase** (Auth JWT + Storage). Conecta criadores de conteúdo e empresas: perfis, portfólio, contratação (`contract-requests`), agenda (`bookings`, disponibilidade), chat (`conversations`) e indicações (`referrals`).

## Stack

| Área | Tecnologia |
|------|------------|
| Framework | **NestJS** 10 |
| ORM | **TypeORM** 0.3.x |
| Banco | **PostgreSQL** (`pg`) — em produção tipicamente **Supabase** |
| Validação | **class-validator** + **class-transformer** |
| Auth | Validação de JWT **Supabase** (`@supabase/supabase-js`) |
| Eventos | **@nestjs/event-emitter** |
| Testes | **Jest** |
| Observabilidade | **Sentry** (`@sentry/node`, opcional) |

Detalhes: [`.specs/codebase/STACK.md`](./.specs/codebase/STACK.md).

## Arquitetura

Monólito **modular por domínio**: cada feature em `src/<domínio>/` com controller, service, DTOs e, quando aplicável, entities e repositories.

**Módulos de aplicação (AppModule):** `Config`, `Database`, `Auth`, `Users`, `Profiles`, `Portfolio`, `Availability`, `JobTypes`, `CreatorJobTypes`, `Bookings`, `ContractRequests`, `Conversations`, `Creator` (calendário), `Referrals`, `Uploads`, `Health`.

**Suporte interno** (importados por outros módulos): `geocoding`, `scheduling`, `platform-settings` (configurações globais como taxas de transporte).

Padrões: **SupabaseAuthGuard** + decorator **`@CurrentUser()`**, repositório customizado onde necessário (ex.: usuários).

Documentação estrutural: [`.specs/codebase/ARCHITECTURE.md`](./.specs/codebase/ARCHITECTURE.md).

## Pré-requisitos

- Node.js **20+**
- PostgreSQL compatível (local ou Supabase)
- Projeto **Supabase** (Auth + Storage + connection string)

## Setup rápido

```bash
npm install
cp .env.example .env   # preencher DATABASE_URL, SUPABASE_*, FRONTEND_URL, etc.
npm run migration:run
npm run start:dev
```

**Storage (Supabase):** criar bucket `avatars` (e demais buckets usados pelo app, ex. portfólio), conforme [`../docs/deploy-setup.md`](../docs/deploy-setup.md).

**Seed de staging (opcional):**

```bash
DATABASE_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:staging
```

## Variáveis de ambiente

Principais: `PORT`, `NODE_ENV`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`, limites de upload (`MAX_AVATAR_SIZE_MB`, `ALLOWED_AVATAR_MIME_TYPES`), `SENTRY_DSN` (opcional). Ver `.env.example`.

## Autenticação

1. O cliente autentica no **Supabase Auth** e obtém `access_token` (JWT).
2. Requisições à API: `Authorization: Bearer <token>`.
3. `POST /users/bootstrap` com `{ "role": "CREATOR" | "COMPANY" }` cria/atualiza usuário e perfis de forma idempotente.
4. Rotas protegidas usam o guard Supabase; o payload do usuário costuma vir de `@CurrentUser()`.

Documentação complementar: [`docs/FRONTEND_INTEGRACAO.md`](./docs/FRONTEND_INTEGRACAO.md), [`FLUXO_AUTENTICACAO.md`](./FLUXO_AUTENTICACAO.md).

## API — visão por área

| Área | Exemplos de rotas |
|------|-------------------|
| Saúde | `GET /health` |
| Auth / usuários | `GET /auth/me`, `POST /users/bootstrap` |
| Perfis | `GET/PATCH /profiles/me`, `PATCH /profiles/me/creator`, `PATCH /profiles/me/company`, `GET /profiles/creators`, `GET /profiles/creators/:id` |
| Portfólio / uploads | upload de mídia, remoção de itens (ver controllers) |
| Jobs e creator | `GET /job-types`, `GET/PUT /creator/availability`, `GET/PUT /creator/job-types`, `GET /creator/calendar` |
| Contratação | `POST /contract-requests/preview`, `POST /contract-requests`, listagens e `PATCH .../accept|reject` |
| Agenda | `POST /bookings`, `POST /bookings/:id/accept|reject|cancel` |
| Conversas | `GET /conversations`, mensagens, envio (ver `ConversationsController`) |
| Indicações | endpoints em `partners` / referrals (ver `ReferralsModule`) |

Lista consolidada de rotas e contratos: [`../DOCUMENTACAO_TECNICA_SISTEMA_ATUAL.md`](../DOCUMENTACAO_TECNICA_SISTEMA_ATUAL.md).

## Entidades (dados)

Modelo centrado em **`User`** e perfis; inclui `ContractRequest`, `Booking`, `JobType`, `CreatorJobType`, `AvailabilityRule`, `Portfolio` / `PortfolioMedia`, `Conversation` / `Message`, `PlatformSetting`, entidades de **referrals**, etc.

Visão detalhada: [`../DOCUMENTACAO_TECNICA_SISTEMA_ATUAL.md`](../DOCUMENTACAO_TECNICA_SISTEMA_ATUAL.md).  
Resumo antigo (perfil/portfólio): [`ENTIDADES-E-RELACIONAMENTOS.md`](./ENTIDADES-E-RELACIONAMENTOS.md).

## Deploy

- **Hospedagem típica:** **Railway** (serviço Node, healthcheck em `GET /health`).
- **Migrations:** rodadas no CI (GitHub Actions) contra `DATABASE_URL_STAGING` / `DATABASE_URL_PROD` ao push em `develop` / `main`.
- **Variáveis:** alinhar com Supabase do ambiente e URL do frontend (`FRONTEND_URL` para CORS).

Guia completo: [`../docs/deploy-setup.md`](../docs/deploy-setup.md).

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run start:dev` | Desenvolvimento com watch |
| `npm run build` / `npm run start:prod` | Build e execução compilada |
| `npm run migration:run` | Aplicar migrations TypeORM |
| `npm run seed:staging` | Seed para ambiente de staging |
| `npm test` | Jest |

## Repositório

Este diretório faz parte do monorepo UGC: [`../README.md`](../README.md).
