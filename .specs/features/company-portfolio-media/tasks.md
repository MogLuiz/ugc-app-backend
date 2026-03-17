# Company Portfolio Media Tasks

**Design**: `backend/.specs/features/company-portfolio-media/design.md`
**Status**: In Progress

---

## Execution Plan

### Phase 1: Foundation (Sequential)

`T1 -> T2 -> T3 -> T4 -> T5`

### Phase 2: Core Implementation (Partially Parallel)

`T5 -> T6 -> T7 -> T8 -> T9`

`T6 -> T10`

### Phase 3: Validation (Sequential)

`T9 -> T11 -> T12 -> T13 -> T14`

---

## Task Breakdown

### T1: Create portfolio entities

**What**: Criar entidades `Portfolio` e `PortfolioMedia`
**Where**: `backend/src/portfolio/entities/`
**Depends on**: None
**Reuses**: `backend/src/profiles/entities/`

**Done when**:

- [ ] Entidades definidas com relações corretas
- [ ] Enums de tipo e status criados
- [ ] Sem erros de TypeScript

### T2: Register portfolio module and entities

**What**: Registrar entidades e módulo de portfólio na aplicação
**Where**: `backend/src/portfolio/`, `backend/src/database/database.module.ts`, `backend/src/app.module.ts`
**Depends on**: T1
**Reuses**: Estrutura de `profiles.module.ts`

**Done when**:

- [ ] Módulo criado
- [ ] Entidades registradas no TypeORM
- [ ] App sobe sem erro de injeção

### T3: Create migration

**What**: Criar migration para `portfolios`, `portfolio_media` e novos campos de `company_profiles`
**Where**: `backend/src/database/migrations/`
**Depends on**: T1, T2
**Reuses**: `1731710000000-BootstrapSchema.ts`

**Done when**:

- [ ] Tabelas novas criadas
- [ ] Campos novos da empresa adicionados
- [ ] Down remove tudo corretamente

### T4: Expand company profile fields

**What**: Adicionar `websiteUrl`, `instagramUsername` e `tiktokUsername` ao perfil da empresa
**Where**: `backend/src/profiles/entities/company-profile.entity.ts`
**Depends on**: T3
**Reuses**: Campos string já existentes em `CompanyProfile`

**Done when**:

- [ ] Entidade expõe os três campos
- [ ] Migration cobre os campos
- [ ] Sem regressão no payload atual

### T5: Update DTOs and payload builders

**What**: Ajustar DTOs e builders de payload para os novos campos da empresa
**Where**: `backend/src/profiles/`, `backend/src/users/users.service.ts`
**Depends on**: T4
**Reuses**: Builders existentes de `ProfilesService` e `UsersService`

**Done when**:

- [ ] DTO aceita os novos campos
- [ ] `GET /profiles/me` retorna os novos campos
- [ ] Bootstrap continua compatível

### T6: Create portfolio service

**What**: Implementar serviço de portfólio com criação lazy e payload builder
**Where**: `backend/src/portfolio/portfolio.service.ts`
**Depends on**: T2, T5
**Reuses**: Convenções de `ProfilesService`

**Done when**:

- [ ] Serviço cria portfólio sob demanda
- [ ] Serviço lista mídia ordenada
- [ ] Serviço remove mídia checando ownership

### T7: Add portfolio media upload endpoint

**What**: Criar endpoint de upload de mídia do portfólio
**Where**: `backend/src/uploads/uploads.controller.ts`
**Depends on**: T6, T10
**Reuses**: Endpoint de upload de avatar

**Done when**:

- [ ] Endpoint aceita imagem e vídeo
- [ ] Salva mídia no portfólio do usuário
- [ ] Retorna payload atualizado de perfil

### T8: Add delete portfolio media endpoint

**What**: Criar endpoint de remoção de mídia do portfólio
**Where**: `backend/src/profiles/profiles.controller.ts`, `backend/src/profiles/profiles.service.ts`
**Depends on**: T6
**Reuses**: Guardas e padrão de `PATCH /profiles/me/*`

**Done when**:

- [ ] Endpoint remove a mídia correta
- [ ] Bloqueia remoção por usuário não dono
- [ ] Retorna payload atualizado

### T9: Include portfolio in authenticated profile payload

**What**: Incluir `portfolio` em `GET /profiles/me`
**Where**: `backend/src/profiles/profiles.service.ts`, `backend/src/users/users.service.ts`
**Depends on**: T6
**Reuses**: Payload builder existente

**Done when**:

- [ ] Payload retorna `portfolio`
- [ ] Usuário sem mídia recebe `media: []`
- [ ] Ordem das mídias é estável

### T10: Extend uploads service for portfolio media

**What**: Adaptar `UploadsService` para suportar imagens e vídeos do portfólio
**Where**: `backend/src/uploads/uploads.service.ts`, `backend/src/config/env.validation.ts`
**Depends on**: T2
**Reuses**: Upload de avatar

**Done when**:

- [ ] Valida tipos e tamanhos de mídia do portfólio
- [ ] Faz upload com URL pública
- [ ] Define `thumbnailUrl` nulo para o slice atual

### T11: Validate empty payload

**What**: Validar usuário sem portfólio populado
**Where**: test/verify commands
**Depends on**: T9

**Done when**:

- [ ] `GET /profiles/me` inclui `portfolio.media: []`

### T12: Validate image upload

**What**: Validar upload de imagem
**Where**: test/verify commands
**Depends on**: T7

**Done when**:

- [ ] Imagem entra no payload
- [ ] Tipo `IMAGE` retornado corretamente

### T13: Validate video upload

**What**: Validar upload de vídeo
**Where**: test/verify commands
**Depends on**: T7

**Done when**:

- [ ] Vídeo entra no payload
- [ ] Tipo `VIDEO` retornado corretamente

### T14: Validate deletion

**What**: Validar remoção de mídia
**Where**: test/verify commands
**Depends on**: T8

**Done when**:

- [ ] Apenas a mídia removida some do payload
- [ ] Demais mídias permanecem intactas
