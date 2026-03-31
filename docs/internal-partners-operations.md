# Operação interna — parceiros de indicação

Estes endpoints são **exclusivamente para uso manual** (Insomnia, Postman, `curl`) por operadores com acesso ao segredo de ambiente.

**Nunca** coloque `INTERNAL_PARTNERS_API_KEY` no frontend, em repositórios públicos ou em clientes móveis. Não há cenário válido em que o browser ou o app do usuário final deva chamar `/internal/partners/*`.

## Variável de ambiente

| Nome | Descrição |
|------|-----------|
| `INTERNAL_PARTNERS_API_KEY` | Segredo forte (ex.: 32+ bytes aleatórios em base64/hex). Se ausente ou vazio, os endpoints retornam **503** com mensagem clara. |

## Autenticação

Todas as rotas exigem:

```http
Authorization: Bearer <valor de INTERNAL_PARTNERS_API_KEY>
```

A comparação no servidor é feita em tempo constante (`timingSafeEqual`). O segredo **não** é logado.

## Endpoints

### `POST /internal/partners/:userId/activate`

- **Path**: `userId` = UUID v4 do registro em `users.id` (id interno da aplicação, **não** o `auth_user_id` do Supabase).
- **Body**: vazio ou `{}`.
- **Sucesso (200)**: mesmo formato já usado pela antiga ativação (ex.: `userId`, `status`, `referralCode`, `referralLink`, `commissionRatePercent`, `activatedAt`).
- **Erros**: `503` chave não configurada; `401`/`403` credencial inválida; `404` usuário inexistente; idempotente se o parceiro já existir (retorna dados atuais).

### `POST /internal/partners/:userId/deactivate`

- **Path**: mesmo `userId` (UUID v4).
- **Sucesso (200)** — exemplo:

```json
{
  "userId": "uuid",
  "partnerStatus": "SUSPENDED",
  "deactivatedAt": "2026-03-31T12:00:00.000Z",
  "referralCode": { "code": "ABC12345", "isActive": false }
}
```

Se não houver código ativo antes da desativação, `referralCode` pode ser `null`.

- **Erros**: `404` usuário ou parceiro inexistente; `401`/`403`/`503` como acima.

## Buscar `users.id` por e-mail (SQL)

Os e-mails são armazenados **normalizados** (trim + minúsculas), alinhados a `normalizeEmail` no backend. Substitua o email na query:

```sql
SELECT id, email, role, created_at
FROM users
WHERE email = lower(trim('usuario@exemplo.com'));
```

Se o seu cliente SQL não aplicar `lower(trim(...))` no literal, use o e-mail já em minúsculas:

```sql
WHERE email = 'usuario@exemplo.com';
```

## Exemplos curl

```bash
export API_KEY="sua-chave-secreta"
export BASE_URL="http://localhost:3000"
export USER_ID="uuid-do-passo-sql"

curl -sS -X POST "$BASE_URL/internal/partners/$USER_ID/activate" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

curl -sS -X POST "$BASE_URL/internal/partners/$USER_ID/deactivate" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Evolução futura possível

- `GET /internal/partners/lookup?email=` com a mesma autenticação por API key, retornando `{ "userId": "..." }`, para evitar SQL manual — opcional quando fizer sentido operacionalmente.
