# Guia de Integração: Frontend + Supabase + Backend

Documentação para conectar o frontend ao Supabase Auth e integrar com o backend NestJS.

---

## 1. Configuração do Supabase no Frontend

### 1.1 Instalação

```bash
npm install @supabase/supabase-js
```

### 1.2 Variáveis de ambiente

Crie `.env.local` (ou `.env`) no projeto frontend:

```env
SUPABASE_URL=https://hxwjzywxkbuvcjpfikvf.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> ⚠️ Use apenas a **anon key** no frontend. Nunca exponha a **service_role key**.

### 1.3 Cliente Supabase

```typescript
// lib/supabase.ts ou src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!; // ou VITE_SUPABASE_URL, etc.
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

> Prefixe com `NEXT_PUBLIC_` (Next.js) ou `VITE_` (Vite) para expor variáveis no cliente.

---

## 2. Autenticação com Supabase

### 2.1 Cadastro (sign up)

```typescript
const { data, error } = await supabase.auth.signUp({
  email: 'usuario@email.com',
  password: 'senha123',
  options: {
    emailRedirectTo: 'https://seuapp.com/auth/callback',
  },
});

if (error) {
  console.error('Erro no cadastro:', error.message);
  return;
}

// Usuário criado. Verificar email se configurado no Supabase
if (data.user && !data.session) {
  // Email de confirmação enviado
  console.log('Verifique seu email');
} else if (data.session) {
  console.log('Logado:', data.session.access_token);
}
```

### 2.2 Login (sign in)

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'usuario@email.com',
  password: 'senha123',
});

if (error) {
  console.error('Erro no login:', error.message);
  return;
}

const accessToken = data.session?.access_token;
const refreshToken = data.session?.refresh_token;

// Armazenar para uso nas requisições ao backend
localStorage.setItem('supabase_token', accessToken);
// Ou usar o contexto/estado da aplicação
```

### 2.3 Logout

```typescript
await supabase.auth.signOut();
```

### 2.4 Persistir sessão

```typescript
// Verificar sessão ao carregar a app
const { data: { session } } = await supabase.auth.getSession();

if (session) {
  const accessToken = session.access_token;
  // Usuário está logado, usar token nas requisições
}
```

### 2.5 Ouvir mudanças de auth

```typescript
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) {
    console.log('Usuário logado:', session.user.email);
  }
  if (event === 'SIGNED_OUT') {
    console.log('Usuário deslogado');
  }
});
```

---

## 3. Integração com o Backend

### 3.1 URL base

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
```

### 3.2 Função helper para requisições autenticadas

```typescript
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const session = await supabase.auth.getSession();
  const accessToken = token || session.data.session?.access_token;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (accessToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Erro ${response.status}`);
  }

  return response.json();
}
```

### 3.3 Bootstrap do usuário

```typescript
// Chamar após login ou ao carregar a app
async function bootstrapUser(role: 'CREATOR' | 'COMPANY') {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error('Usuário não autenticado');
  }

  const user = await apiRequest('/users/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ role }),
  }, token);

  return user;
}
```

### 3.4 Buscar perfil

```typescript
async function getProfile() {
  return apiRequest('/profiles/me');
}
```

### 3.5 Atualizar perfil

```typescript
async function updateProfile(data: {
  name?: string;
  birthDate?: string;
  bio?: string;
  onboardingStep?: number;
  // ... outros campos
}) {
  return apiRequest('/profiles/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
```

### 3.6 Upload de avatar

```typescript
async function uploadAvatar(file: File) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) throw new Error('Não autenticado');

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/uploads/avatar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Erro no upload');
  }

  return response.json();
}
```

---

## 4. Fluxo completo de onboarding

```typescript
// Exemplo de fluxo completo
async function handleOnboarding() {
  // 1. Usuário logou no Supabase
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  // 2. Bootstrap (idempotente)
  let user = await bootstrapUser('CREATOR'); // ou 'COMPANY'

  // 3. Atualizar perfil conforme onboarding
  if (user.profile.onboardingStep === 1) {
    user = await updateProfile({
      name: 'João Silva',
      onboardingStep: 2,
    });
  }

  // 4. Upload avatar (opcional)
  if (avatarFile) {
    user = await uploadAvatar(avatarFile);
  }

  return user;
}
```

---

## 5. Exemplo com React (hooks)

```typescript
// hooks/useAuth.ts
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    );

    return () => subscription.unsubscribe();
  }, []);

  return { session, loading };
}
```

```typescript
// hooks/useUser.ts
import { useAuth } from './useAuth';
import { bootstrapUser, getProfile } from '@/lib/api';

export function useUser() {
  const { session } = useAuth();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setUser(null);
      setLoading(false);
      return;
    }

    getProfile()
      .then(setUser)
      .catch(() => {
        // Se 404, usuário não fez bootstrap
        return null;
      })
      .finally(() => setLoading(false));
  }, [session]);

  const bootstrap = async (role: 'CREATOR' | 'COMPANY') => {
    const u = await bootstrapUser(role);
    setUser(u);
    return u;
  };

  return { user, loading, bootstrap };
}
```

---

## 6. Tratamento de erros comuns

| Código | Significado | Ação |
|--------|-------------|------|
| 401 | Token inválido ou expirado | Fazer logout ou refresh do token |
| 404 | Usuário não encontrado | Chamar POST /users/bootstrap |
| 403 | Sem permissão | Ex: COMPANY tentando PATCH /profiles/me/creator |
| 400 | Dados inválidos | Verificar body e validações |

---

## 7. Refresh do token

O Supabase renova o token automaticamente. Para obter o token atualizado:

```typescript
const { data: { session } } = await supabase.auth.refreshSession();
const newToken = session?.access_token;
```

---

## 8. Checklist de integração

- [ ] Instalar `@supabase/supabase-js`
- [ ] Configurar `SUPABASE_URL` e `SUPABASE_ANON_KEY` no frontend
- [ ] Configurar `API_URL` do backend (ex: `http://localhost:3000`)
- [ ] Criar cliente Supabase
- [ ] Implementar fluxo de login/signup
- [ ] Chamar POST /users/bootstrap após login
- [ ] Incluir `Authorization: Bearer {token}` em todas as requisições ao backend
- [ ] Tratar 401 (redirect para login)
- [ ] Tratar 404 em /profiles/me (redirecionar para bootstrap/onboarding)
