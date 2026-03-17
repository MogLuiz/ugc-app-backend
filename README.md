# UGC Backend

Backend MVP que conecta criadores de conteúdo e empresas.

## Pré-requisitos

- Node.js 20+ (recomendado)
- PostgreSQL 14+
- Conta Supabase

## Setup

1. **Instalar dependências**
   ```bash
   npm install
   ```

2. **Configurar variáveis de ambiente**
   ```bash
   cp .env.example .env
   # Editar .env com suas credenciais
   ```

3. **Criar banco de dados**
   ```bash
   createdb ugc
   ```

4. **Rodar migrations**
   ```bash
   npm run migration:run
   ```

5. **Rodar seed (tags iniciais)**
   ```bash
   npm run seed:run
   ```

6. **Criar bucket no Supabase Storage**
   - No painel Supabase: Storage → New bucket
   - Nome: `avatars`
   - Público: sim (para URLs públicas de avatar)

7. **Iniciar o servidor**
   ```bash
   npm run start:dev
   ```

## Endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | /health | - | Healthcheck |
| GET | /auth/me | Bearer | Retorna usuário autenticado (null se não bootstrapped) |
| POST | /users/bootstrap | Bearer | Bootstrap idempotente do usuário |
| GET | /profiles/me | Bearer | Perfil completo do usuário |
| PATCH | /profiles/me | Bearer | Atualiza perfil base |
| PATCH | /profiles/me/creator | Bearer | Atualiza perfil de criador |
| PATCH | /profiles/me/company | Bearer | Atualiza perfil de empresa |
| POST | /uploads/avatar | Bearer | Upload de avatar (multipart/form-data, campo `file`) |

## Fluxo de autenticação

1. Frontend: usuário cria conta via Supabase Auth
2. Frontend: recebe `access_token` (JWT)
3. Frontend: chama `POST /users/bootstrap` com `Authorization: Bearer <token>` e body `{ "role": "CREATOR" | "COMPANY" }`
4. Backend: valida JWT, cria ou retorna user + profiles
5. Rotas protegidas: envie o Bearer token em todas as requisições

## Documentação

- **[docs/FRONTEND_INTEGRACAO.md](docs/FRONTEND_INTEGRACAO.md)** — Guia completo para conectar o frontend ao Supabase e integrar com o backend
- **[FLUXO_AUTENTICACAO.md](FLUXO_AUTENTICACAO.md)** — Análise do fluxo de autenticação e criação de perfil
