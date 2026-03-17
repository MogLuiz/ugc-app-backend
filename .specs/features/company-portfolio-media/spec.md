# Company Portfolio Media Specification

## Problem Statement

A tela de edição de perfil da empresa agora precisa expor uma galeria real de imagens e vídeos para apresentar a marca aos creators. O backend atual só suporta dados textuais do perfil e um `portfolio_url` legado no perfil de creator, então precisamos criar um portfólio reutilizável por usuário sem acoplar a feature ao papel da conta.

## Goals

- [ ] Permitir que uma empresa autenticada adicione e remova mídias no próprio perfil.
- [ ] Incluir o portfólio no payload de `GET /profiles/me` para consumo real do frontend.
- [ ] Manter o modelo reutilizável para creator sem remodelagem adicional.

## Out of Scope

- Descrição do portfólio
- Caption textual por mídia
- Edição avançada de vídeo
- Múltiplos portfólios por usuário
- Drag and drop sofisticado

---

## User Stories

### P1: Empresa gerencia o próprio portfólio ⭐ MVP

**User Story**: Como empresa autenticada, eu quero adicionar e remover mídias do meu perfil para apresentar melhor a minha marca aos creators.

**Why P1**: Sem persistência e leitura real da galeria, a nova seção de portfólio no frontend vira apenas UI estática.

**Acceptance Criteria**:

1. WHEN a empresa abrir a tela de edição THEN o sistema SHALL retornar o bloco `portfolio` em `GET /profiles/me`
2. WHEN a empresa não tiver mídias THEN o sistema SHALL retornar `portfolio.media` vazio
3. WHEN a empresa enviar uma imagem válida THEN o sistema SHALL persistir a mídia e retorná-la no payload atualizado
4. WHEN a empresa enviar um vídeo válido THEN o sistema SHALL persistir a mídia e retorná-la no payload atualizado
5. WHEN a empresa remover uma mídia THEN o sistema SHALL excluir apenas aquela mídia
6. WHEN a empresa salvar alterações do perfil THEN o sistema SHALL manter dados gerais e portfólio consistentes no payload

**Independent Test**: Chamar `GET /profiles/me`, subir uma imagem e um vídeo, remover uma mídia e confirmar o payload resultante.

---

### P1: Frontend consome API real ⭐ MVP

**User Story**: Como frontend autenticado, eu quero ler o portfólio no mesmo payload do perfil para renderizar a nova seção sem mocks.

**Why P1**: O vertical slice só fecha se o frontend conseguir ler e atualizar o portfólio via API real.

**Acceptance Criteria**:

1. WHEN a tela carregar THEN o frontend SHALL ler o portfólio do usuário autenticado via API
2. WHEN houver alteração no portfólio THEN o frontend SHALL refletir o novo estado sem depender de mock

**Independent Test**: Recarregar a tela após upload ou remoção e validar que o estado continua correto.

---

### P2: Contrato reutilizável para perfil público

**User Story**: Como produto, eu quero reutilizar o mesmo shape de portfólio para company e creator para evitar duplicação de domínio.

**Why P2**: Não bloqueia o slice da empresa, mas evita retrabalho na próxima etapa do creator.

**Acceptance Criteria**:

1. WHEN outro perfil usar o contrato de portfólio THEN o sistema SHALL conseguir reutilizar o mesmo shape sem nova modelagem

**Independent Test**: Verificar que o payload depende de `user` e não de `company_profile` ou `creator_profile`.

---

## Edge Cases

- WHEN o usuário ainda não tiver portfólio THEN o sistema SHALL retornar `portfolio` com `media: []`
- WHEN o arquivo tiver tipo inválido THEN o sistema SHALL rejeitar o upload com erro 400
- WHEN o arquivo exceder o limite configurado THEN o sistema SHALL rejeitar o upload com erro 400
- WHEN a mídia não pertencer ao usuário autenticado THEN o sistema SHALL rejeitar a remoção

## Success Criteria

- [ ] Empresa consegue adicionar imagem e vídeo na própria galeria
- [ ] Empresa consegue remover uma mídia sem afetar as demais
- [ ] `GET /profiles/me` retorna `portfolio` real e consistente
