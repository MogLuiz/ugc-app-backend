# Roadmap

**Current Milestone:** M1 - Foundation
**Status:** In Progress

---

## M1: Foundation (MVP)

**Goal:** Autenticação, perfis e upload funcionando para criadores e empresas.

**Target:** MVP shippable

### Features

**Auth + Bootstrap** - COMPLETE

- Autenticação via Supabase JWT
- POST /users/bootstrap cria User + Profile + CreatorProfile ou CompanyProfile
- GET /auth/me retorna dados do usuário autenticado

**Profiles** - COMPLETE

- GET /profiles/me
- PATCH /profiles/me (perfil base)
- PATCH /profiles/me/creator (criadores)
- PATCH /profiles/me/company (empresas)

**Avatar Upload** - COMPLETE

- POST /uploads/avatar (multipart)
- Supabase Storage bucket avatars
- Atualização de photoUrl no perfil

**Health** - COMPLETE

- GET /health para monitoramento

---

## M2: Quality & Observability

**Goal:** Testes e observabilidade para produção.

### Features

**Unit Tests** - PLANNED

- UsersService, ProfilesService
- SupabaseAuthGuard
- UploadsService

**Integration Tests** - PLANNED

- Fluxo auth → bootstrap → profile
- Endpoints protegidos

**Logging/Monitoring** - PLANNED

- Structured logging
- Error tracking (opcional)

---

## M3: Core Domain (Future)

**Goal:** Funcionalidades de matching e campanhas.

### Features

**Campanhas** - PLANNED

- CRUD de campanhas (empresas)
- Listagem para criadores

**Matching** - PLANNED

- Aplicação de criadores a campanhas
- Status e workflow

---

## Future Considerations

- Pagamentos/integrations
- Notificações
- Analytics
- Admin panel API
