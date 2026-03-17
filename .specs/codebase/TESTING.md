# Testing Infrastructure

## Test Frameworks

**Unit/Integration:** Jest 29.x
**E2E:** Não configurado
**Coverage:** `jest --coverage` (via npm run test:cov)

## Test Organization

**Location:** Não há testes implementados ainda
**Naming:** Padrão NestJS: `*.spec.ts` ao lado do arquivo ou em `__tests__/`
**Structure:** Jest configurado no package.json; jest.config pode estar implícito ou em raiz

## Testing Patterns

### Unit Tests

**Approach:** A definir
**Location:** `src/**/*.spec.ts` (convenção NestJS)
**Description:** Serviços, guards e lógica de negócio devem ser testados com mocks de repositórios e ConfigService

### Integration Tests

**Approach:** A definir
**Location:** `test/` (se existir)
**Description:** Testes de API com supertest e banco em memória ou container são recomendados

### E2E Tests

**Approach:** Não implementado
**Location:** N/A
**Description:** Para fluxos completos (auth + bootstrap + profile), considerar testes E2E com Supabase local ou mock

## Test Execution

**Commands:**
- `npm test` — roda Jest
- `npm run test:watch` — modo watch
- `npm run test:cov` — cobertura

**Configuration:** Jest via package.json; ts-jest para TypeScript

## Coverage Targets

**Current:** N/A (sem testes)
**Goals:** A definir após implementação
**Enforcement:** Não automatizado
