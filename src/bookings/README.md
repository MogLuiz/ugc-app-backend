# Nucleo de Agenda e Booking

## Modulos do MVP

- `availability`: disponibilidade semanal recorrente do creator.
- `job-types`: catalogo interno de tipos de job com duracao fixa.
- `bookings`: solicitacoes de agenda, transicoes de status e consulta da agenda do creator.

## Regras implementadas

- A agenda visual e derivada exclusivamente da tabela `bookings`.
- `PENDING` e `CONFIRMED` bloqueiam agenda.
- Cada creator pode ter apenas 1 regra de disponibilidade por dia da semana no MVP.
- `PUT /creator/availability` substitui integralmente a semana do creator em transacao.
- Alteracoes de disponibilidade nao invalidam bookings futuros ja existentes; a nova regra so vale para novas solicitacoes.
- A criacao de booking calcula `endDateTime` automaticamente com base em `startDateTime + JobType.durationMinutes`.
- O booking persiste `jobTypeNameSnapshot` e `durationMinutesSnapshot` para preservar historico se o catalogo mudar.
- A validacao de conflito usa a regra:
  - `existing.startDateTime < newEndDateTime && existing.endDateTime > newStartDateTime`
- Bookings encostados sao permitidos.
- Toda a logica de agenda usa timezone fixa `America/Sao_Paulo`.

## Permissoes do MVP

- `GET /creator/availability`: apenas creator autenticado.
- `PUT /creator/availability`: apenas creator autenticado.
- `GET /job-types`: usuario autenticado.
- `POST /bookings`: apenas company autenticada.
- `GET /creator/calendar`: apenas creator autenticado.
- `POST /bookings/:id/accept`: apenas o creator do booking.
- `POST /bookings/:id/reject`: apenas o creator do booking.
- `POST /bookings/:id/cancel`: creator ou company vinculados ao booking.

## Contrato de `GET /creator/calendar`

Retorna a base estruturada para a futura integracao da UI de calendario.

### Campos preferenciais do contrato

Estes sao os campos que novos consumidores devem preferir:

- `id`
- `title`
- `status`
- `mode`
- `startDateTime`
- `endDateTime`
- `jobTypeName`
- `durationMinutes`
- `companyName` (nullable) — nome de exibicao da empresa
- `contractRequestId` (nullable) — UUID do contract request quando a linha vem de oferta aceita
- `location` (nullable) — endereco ou texto de local quando existir (ex. contract request)

### Campos legados temporarios

Os campos abaixo permanecem temporariamente por compatibilidade com o frontend atual:

- `description`
- `origin`
- `notes`
- `jobType`
- `companyUserId`
- `creatorUserId`
- `isBlocking`

```json
{
  "creatorUserId": "uuid",
  "timezone": "America/Sao_Paulo",
  "range": {
    "start": "2026-03-18T00:00:00.000Z",
    "end": "2026-03-25T00:00:00.000Z"
  },
  "blockedStatuses": ["PENDING", "CONFIRMED"],
  "bookings": [
    {
      "id": "uuid",
      "title": "Workshop de Cores",
      "description": "string | null",
      "status": "PENDING | CONFIRMED | REJECTED | CANCELLED | COMPLETED",
      "mode": "PRESENTIAL | REMOTE | HYBRID",
      "startDateTime": "ISO-8601",
      "endDateTime": "ISO-8601",
      "jobTypeName": "Workshop Presencial",
      "durationMinutes": 90,
      "origin": "COMPANY_REQUEST | MANUAL_INTERNAL | SYSTEM",
      "notes": "string | null",
      "jobType": {
        "id": "uuid",
        "name": "Workshop Presencial"
      },
      "companyUserId": "uuid",
      "creatorUserId": "uuid",
      "isBlocking": true
    }
  ]
}
```

## Limitacoes do MVP

- Nao existe suporte a multiplos intervalos por dia.
- Nao existe excecao por data especifica, feriado ou bloqueio manual.
- Nao existe suporte multi-timezone.
- `JobType` ainda nao possui CRUD publico; os tipos iniciais sao criados via migration idempotente.
- Nao existe endpoint publico para marcar booking como `COMPLETED`.
