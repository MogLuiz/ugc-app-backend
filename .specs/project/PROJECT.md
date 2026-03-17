# UGC Backend

**Vision:** API backend que conecta criadores de conteúdo e empresas em uma plataforma de UGC (User Generated Content).

**For:** Empresas que buscam criadores e criadores que buscam oportunidades de trabalho.

**Solves:** Centralizar autenticação, perfis e gestão de usuários (criadores vs empresas) para uma plataforma de matching.

## Goals

- Fornecer API REST estável para o frontend consumir
- Suportar dois tipos de usuário (criador e empresa) com perfis específicos
- Integrar com Supabase Auth e Storage de forma segura
- Manter código modular e testável

## Tech Stack

**Core:**

- Framework: NestJS 10.4.x
- Language: TypeScript 5.7.x
- Database: PostgreSQL (TypeORM)

**Key dependencies:** @supabase/supabase-js, class-validator, class-transformer, pg

## Scope

**v1 includes:**

- Autenticação via Supabase JWT
- Bootstrap de usuário (criação de User + Profile após signup)
- Perfis: base, criador (CreatorProfile), empresa (CompanyProfile)
- Upload de avatar (Supabase Storage)
- Health check

**Explicitly out of scope:**

- Autenticação própria (usa Supabase)
- Upload de outros tipos de arquivo além de avatar
- Matching/campanhas entre criadores e empresas
- Pagamentos

## Constraints

- Timeline: MVP em andamento
- Technical: Supabase como BaaS para auth e storage
- Resources: Monorepo com frontend em pasta separada
