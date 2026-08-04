# Contributing

## Repository layout

```
frontend/           Next.js app (TS strict)
backend/             Laravel 12 API
whatsapp-gateway/    Node/TS Baileys gateway
infrastructure/      docker-compose assets, nginx, monitoring, scripts
docs/                architecture & design docs — read before making structural changes
```

## Workflow

1. Read `docs/DECISIONS.md` and `docs/DATA_OWNERSHIP.md` before touching schema or
   cross-service boundaries — they encode already-made architectural calls.
2. Each service is independently installable/buildable; do not introduce cross-service
   runtime imports. Cross-service communication is via the REST API (`/api/v1`) or the
   internal gateway<->backend API described in `docs/DATA_OWNERSHIP.md`.
3. Follow the API response contract exactly:
   - success: `{ success: true, message, data, meta }`
   - validation error: `{ success: false, message, errors }`
   - general failure: `{ success: false, message, code }`
4. All new tenant tables must include `workspace_id` and be scoped by it in every query.
   `messages` must keep `UNIQUE(workspace_id, whatsapp_message_id)`.
5. Permissions are additive and checked by permission name, never by role name
   (`$user->can('contacts.edit')`, not `$user->role === 'Admin'`). See
   `docs/07-permission-matrix.md`.

## Code style

- Backend: PSR-12, Laravel Pint if configured, feature tests for new endpoints (`php artisan test`).
- Frontend: ESLint + Prettier (`npm run lint`), TypeScript strict — no `any` without justification.
- Gateway: ESLint + Prettier, Zod-validate any new env var in `src/config/env.ts`.

## Before opening a PR

- `cd backend && composer install && php artisan test`
- `cd frontend && npm install && npm run lint && npm run build`
- `cd whatsapp-gateway && npm install && npm run build`
- Update `docs/` if you changed schema, API surface, permissions, or realtime events.
- Update `CHANGELOG.md` under `[Unreleased]`.

## Commit style

Short imperative subject line, explain *why* in the body when non-obvious. Do not amend
shared history; do not force-push to main.
