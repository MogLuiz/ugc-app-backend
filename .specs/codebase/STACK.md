# Tech Stack

**Analyzed:** 2025-03-17

## Core

- Framework: NestJS 10.4.x
- Language: TypeScript 5.7.x
- Runtime: Node.js (ES2021 target)
- Package manager: npm

## Backend

- API Style: REST + NestJS Platform Express
- Database: TypeORM 0.3.x + PostgreSQL (pg 8.x)
- Authentication: Supabase Auth (JWT validation via @supabase/supabase-js)
- Validation: class-validator + class-transformer
- Migrations: TypeORM migrations (ts-node run)

## Storage

- File storage: Supabase Storage (bucket `avatars` para avatares)
- Upload: Multer (via FileInterceptor do NestJS)

## Testing

- Unit/Integration: Jest 29.x (configurado, sem testes implementados ainda)
- Coverage: jest --coverage
- E2E: Não configurado

## External Services

- Supabase: Auth (JWT), Storage (avatars)
- PostgreSQL: Banco de dados principal (local ou Supabase)

## Development Tools

- Linting: ESLint 9.x + @typescript-eslint
- Formatting: Prettier
- Build: NestJS CLI (nest build)
- Path aliases: @/* → src/*
