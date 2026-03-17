# Análise do Fluxo de Autenticação e Criação de Perfil

## Status: Pronto para integração

O backend está completo para integração com o frontend. Verifique apenas se as migrations foram executadas no banco que você está usando.

---

## Fluxo completo (ordem recomendada)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. FRONTEND: Login/Signup via Supabase Auth                                  │
│    → supabase.auth.signInWithPassword() ou signUp()                           │
│    → Recebe: access_token, refresh_token                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. FRONTEND: Bootstrap (primeira vez ou retorno)                             │
│    POST /users/bootstrap                                                     │
│    Headers: Authorization: Bearer {access_token}                             │
│    Body: { "role": "CREATOR" | "COMPANY" }                                   │
│    → Idempotente: se já existe, retorna usuário; senão cria                  │
│    → Retorna: payload consolidado (user + profile + creator/company)          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. FRONTEND: Perfil e onboarding                                             │
│    GET  /profiles/me          → dados consolidados                            │
│    PATCH /profiles/me         → atualiza profile base                         │
│    PATCH /profiles/me/creator → atualiza creator (só role CREATOR)            │
│    PATCH /profiles/me/company → atualiza company (só role COMPANY)             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. FRONTEND: Avatar (opcional)                                                │
│    POST /uploads/avatar                                                      │
│    Headers: Authorization: Bearer {access_token}                              │
│    Body: multipart/form-data, campo "file"                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Endpoints disponíveis

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | /health | Não | Healthcheck |
| GET | /auth/me | Sim | Dados do JWT (authUserId, email, role) |
| POST | /users/bootstrap | Sim | Cria/retorna usuário no domínio |
| GET | /profiles/me | Sim | Perfil consolidado |
| PATCH | /profiles/me | Sim | Atualiza profile base |
| PATCH | /profiles/me/creator | Sim | Atualiza creator_profile |
| PATCH | /profiles/me/company | Sim | Atualiza company_profile |
| POST | /uploads/avatar | Sim | Upload de avatar |

---

## Migrations

### Verificar se já rodou

As tabelas necessárias são: `users`, `profiles`, `creator_profiles`, `company_profiles`.

**Local (PostgreSQL/Docker):**
```bash
psql -U postgres -d ugc -c "\dt"
# Deve listar: users, profiles, creator_profiles, company_profiles, migrations
```

**Supabase:**
- Dashboard → Table Editor → verificar se as tabelas existem

### Rodar migrations (se necessário)

```bash
npm run migration:run
```

O comando usa o banco configurado no `.env`:
- **Local:** `DB_HOST=localhost` (padrão atual)
- **Supabase:** defina `DATABASE_URL` com a connection string do Session pooler

---

## Checklist para integração

- [ ] Migrations executadas no banco em uso
- [ ] `.env` com SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
- [ ] Bucket `avatars` criado e público (para upload)
- [ ] Backend rodando (`npm run start:dev`)

---

## Fluxo alternativo no frontend (carregamento inicial)

Se o usuário já está logado e recarrega a página:

```
1. Restaurar sessão Supabase (getSession)
2. Se tem token:
   a) Tentar GET /profiles/me
   b) Se 404 → usuário não fez bootstrap → mostrar seleção de role → POST /users/bootstrap
   c) Se 200 → usuário completo, seguir para app
3. Se não tem token → redirecionar para login
```

Ou, mais simples:

```
1. Restaurar sessão
2. Se tem token → POST /users/bootstrap com { role } (idempotente)
3. Usar resposta como dados do usuário
```

Para o caso (2), o frontend precisa ter o `role` guardado (ex.: localStorage) na primeira vez, ou pedir novamente. O backend ignora o role quando o usuário já existe.

---

## Conclusão

O backend está pronto. Basta garantir que as migrations foram executadas no banco que você está usando (local ou Supabase).
