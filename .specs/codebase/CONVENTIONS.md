# Code Conventions

## Naming Conventions

**Files:**
- Modules: `*.module.ts`
- Controllers: `*.controller.ts`
- Services: `*.service.ts`
- Entities: `*.entity.ts`
- DTOs: `dto/*.dto.ts` (kebab-case no nome: `update-profile.dto.ts`)
- Enums: `*.enum.ts`
- Guards: `*.guard.ts`
Examples: `profiles.service.ts`, `update-creator-profile.dto.ts`

**Functions/Methods:**
- camelCase
- Verbos descritivos: `getMe`, `updateProfile`, `bootstrap`, `findByAuthUserIdWithProfiles`
Examples: `getUserOrThrow`, `buildPayload`, `uploadAvatar`

**Variables:**
- camelCase
- `authUserId` para ID do Supabase Auth
- `userId` para ID interno (UUID) do banco
Examples: `dbUser`, `creator`, `profileRepo`

**Constants:**
- UPPER_SNAKE_CASE para constantes de módulo
Examples: `BUCKET`, `ALLOWED_MIME`, `MIME_EXT`

## Code Organization

**Import/Dependency Declaration:**
- Ordem: NestJS/core → externos → internos (relativos)
- Exemplo: `import { Controller } from '@nestjs/common';` antes de `import { UsersService } from './users.service';`

**File Structure:**
- Decorators no topo da classe
- Constructor com injeção
- Métodos públicos primeiro, privados depois
- Métodos auxiliares (buildPayload, getUserOrThrow) no final

## Type Safety/Documentation

**Approach:** TypeScript strict (strictNullChecks, noImplicitAny)
- Interfaces para contratos: `AuthUser`
- Enums para domínios: `UserRole`, `UserStatus`, `DocumentType`
- DTOs com class-validator para validação de entrada

**Example:**
```typescript
export interface AuthUser {
  authUserId: string;
  email: string;
  role: string;
}
```

## Error Handling

**Pattern:** Exceptions do NestJS (NotFoundException, ForbiddenException, BadRequestException, UnauthorizedException)
- Mensagens em português
- Exemplo: `throw new NotFoundException('Usuário não encontrado. Complete o cadastro em POST /users/bootstrap');`

## Comments/Documentation

**Style:** Comentários mínimos; código autoexplicativo
- Erros de config em português: `'SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios para autenticação'`
