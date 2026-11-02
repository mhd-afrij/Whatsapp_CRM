# Contributing

## Repository Layout

```
frontend/           Next.js 16 app (App Router, TS strict)
backend/            Laravel 12 API (PHP 8.2, Supabase PostgreSQL)
whatsapp-gateway/   Node/TS Baileys gateway + pg-boss queue worker
scripts/            Database backup & restore operational utilities
docs/               Architecture, API contracts, deployment runbooks, and archives
```

## Workflow

1. Read `docs/architecture/DECISIONS.md` and `docs/architecture/DATA_OWNERSHIP.md` before touching schema or cross-service boundaries — they encode established architectural patterns.
2. Each service is independently installable/buildable; do not introduce cross-service runtime imports. Cross-service communication is via the REST API (`/api/v1`) or the internal gateway<->backend API.
3. Follow the API response contract strictly:
   - success: `{ success: true, message, data, meta }`
   - validation error: `{ success: false, message, errors }`
   - general failure: `{ success: false, message, code }`
4. All new tenant tables must include `workspace_id` and be scoped by it in every query. `messages` must keep `UNIQUE(workspace_id, whatsapp_message_id)`.
5. Permissions are additive and checked by permission name, never by role name (`$user->can('contacts.edit')`, not `$user->role === 'Admin'`). See `docs/architecture/ACCESS_LIST.md`.

## Code Style & Testing

- Backend: PSR-12, feature tests for new endpoints (`php artisan test`).
- Frontend: ESLint + Prettier, TypeScript strict (`npm test`, `npm run typecheck`, `npm run build`).
- Gateway: ESLint + Prettier, Zod-validate any new env var in `src/config/env.ts` (`npm test`, `npm run build`).

## Before Opening a PR

- `cd backend && php artisan test`
- `cd frontend && npm test && npm run typecheck && npm run build`
- `cd whatsapp-gateway && npm test && npm run build`
- Update `docs/` if you changed schema, API surface, permissions, or realtime events.
- Update `CHANGELOG.md` under `[Unreleased]`.

## Commit Style

Short imperative subject line, explain *why* in the body when non-obvious.
