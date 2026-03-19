# Entidades e Relacionamentos do Backend UGC

Use este arquivo como contexto ao conversar com o ChatGPT sobre o backend.

---

## Visão Geral

O backend usa **TypeORM** com **PostgreSQL**. A entidade central é `User`, que se relaciona com perfis específicos por role e com portfólio de mídia.

---

## Entidades

### 1. User (`users`)
Entidade central de autenticação (Supabase Auth).

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | PK |
| `authUserId` | varchar(255) | ID do Supabase Auth (único) |
| `email` | varchar(255) | E-mail |
| `phone` | varchar(50) | Telefone (opcional) |
| `role` | enum | `CREATOR` ou `COMPANY` |
| `status` | enum | `PENDING`, `ACTIVE`, `BLOCKED` |
| `createdAt`, `updatedAt` | timestamp | Auditoria |

---

### 2. Profile (`profiles`)
Perfil base compartilhado por todos os usuários. **1:1 com User**.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `userId` | UUID | PK e FK para `users` |
| `name` | varchar(255) | Nome |
| `birthDate` | date | Data de nascimento |
| `gender` | varchar(50) | Gênero |
| `photoUrl` | varchar(500) | URL da foto |
| `addressStreet`, `addressNumber`, `addressCity`, `addressState`, `addressZipCode` | varchar | Endereço |
| `bio` | text | Biografia |
| `onboardingStep` | int | Etapa do onboarding (default: 1) |

---

### 3. CreatorProfile (`creator_profiles`)
Perfil específico para criadores de conteúdo. **1:1 com User** (quando role=CREATOR).

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `userId` | UUID | PK e FK para `users` |
| `cpf` | varchar(20) | CPF |
| `instagramUsername` | varchar(100) | Instagram |
| `tiktokUsername` | varchar(100) | TikTok |
| `referralSource` | varchar(255) | Origem da indicação |
| `portfolioUrl` | varchar(500) | URL do portfólio externo |

---

### 4. CompanyProfile (`company_profiles`)
Perfil específico para empresas. **1:1 com User** (quando role=COMPANY).

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `userId` | UUID | PK e FK para `users` |
| `documentType` | enum | `CPF` ou `CNPJ` |
| `documentNumber` | varchar(20) | Número do documento |
| `companyName` | varchar(255) | Razão social |
| `jobTitle` | varchar(100) | Cargo |
| `businessNiche` | varchar(255) | Nicho de negócio |
| `websiteUrl` | varchar(500) | Site |
| `instagramUsername` | varchar(100) | Instagram |
| `tiktokUsername` | varchar(100) | TikTok |

---

### 5. Portfolio (`portfolios`)
Portfólio de mídia do usuário. **1:1 com User**.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | PK |
| `userId` | UUID | FK para `users` (único) |
| `createdAt`, `updatedAt` | timestamp | Auditoria |

---

### 6. PortfolioMedia (`portfolio_media`)
Itens de mídia do portfólio. **N:1 com Portfolio**.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | PK |
| `portfolioId` | UUID | FK para `portfolios` |
| `type` | enum | `IMAGE` ou `VIDEO` |
| `storagePath` | varchar(500) | Caminho no storage |
| `publicUrl` | varchar(500) | URL pública |
| `thumbnailUrl` | varchar(500) | URL do thumbnail |
| `mimeType` | varchar(100) | Tipo MIME |
| `sortOrder` | int | Ordem de exibição |
| `status` | enum | `PROCESSING`, `READY`, `FAILED` |

---

## Diagrama de Relacionamentos

```
                    ┌─────────────┐
                    │    User     │
                    │  (central)  │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┬─────────────────┐
         │ 1:1             │ 1:1             │ 1:1             │ 1:1
         ▼                 ▼                 ▼                 ▼
┌─────────────┐   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐
│   Profile   │   │ CreatorProfile  │  │ CompanyProfile  │  │  Portfolio  │
│  (base)     │   │ (role=CREATOR)  │  │ (role=COMPANY)  │  │             │
└─────────────┘   └─────────────────┘  └─────────────────┘  └──────┬──────┘
                                                                     │
                                                                     │ 1:N
                                                                     ▼
                                                            ┌─────────────────┐
                                                            │ PortfolioMedia  │
                                                            │ (IMAGE/VIDEO)   │
                                                            └─────────────────┘
```

---

## Enums

- **UserRole**: `CREATOR`, `COMPANY`
- **UserStatus**: `PENDING`, `ACTIVE`, `BLOCKED`
- **DocumentType**: `CPF`, `CNPJ`
- **PortfolioMediaType**: `IMAGE`, `VIDEO`
- **PortfolioMediaStatus**: `PROCESSING`, `READY`, `FAILED`

---

## Regras de Negócio

1. **User** é a entidade central; todas as outras referenciam via `userId`.
2. **Profile** é obrigatório para todo usuário.
3. **CreatorProfile** existe apenas para `role=CREATOR`.
4. **CompanyProfile** existe apenas para `role=COMPANY`.
5. **Portfolio** e **PortfolioMedia** servem criadores e empresas.
6. **Cascata**: deletar User remove Profile, CreatorProfile, CompanyProfile, Portfolio e PortfolioMedia.
7. Deletar Portfolio remove PortfolioMedia (CASCADE).
