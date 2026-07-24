# WhatsApp CRM — Backend

Two independently deployable services:

```text
api/              Laravel 12 CRM REST API
whatsapp-sync/    Node.js WhatsApp linked-device sync service
```

This repo was split out of the original `whatsapp-crm` monorepo (see the sibling `CRM` repo for the full product specification, architecture docs, and `docker-compose.yml` that runs this repo alongside `CRM-Frontend`). Read `CLAUDE.md` and `docs/` there before making architectural changes — the engineering rules (workspace scoping, audit logging, RBAC, security requirements) apply here unchanged.

## api/ — Laravel CRM API

```bash
cd api
composer install
cp .env.example .env   # or reuse the working local .env already in this repo
php artisan key:generate
php artisan migrate --seed
php artisan serve --port=8000
```

Checks: `./vendor/bin/pint --test`, `./vendor/bin/pest`.

Demo logins (workspace `demo`): `owner@demo.test` / `admin@demo.test` / `lead@demo.test` / `agent@demo.test`, password `password12345`.

## whatsapp-sync/ — WhatsApp sync service

```bash
cd whatsapp-sync
npm install
cp .env.example .env
npm run dev   # http://localhost:3100
```

Checks: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`.

## Current status

Phase 1 (foundation) and Phase 2 (authentication & access control) are complete for `api/`. `whatsapp-sync/` is still foundation-only (`/health`, `/ready` stubs) — no WhatsApp protocol code yet (Phase 3). See the `CRM` repo's `docs/IMPLEMENTATION_STATUS.md` for full detail; that document has not yet been split per-repo.
