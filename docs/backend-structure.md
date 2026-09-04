# Backend Structure

## Active Backend

`backend/` is the active Laravel CRM API.

Evidence:

- `docker-compose.yml` builds the `backend` service from `./backend`.
- The frontend default API URL points at `http://localhost:8000/api/v1` served by `backend/`.
- The gateway calls `http://backend:8000/api/internal` on the compose network.
- The top-level README documents `backend/` as the Laravel 12 REST API.
- No deployment, compose, frontend, or gateway reference points to `backend/api/` (removed).

`backend/` owns CRM business logic: auth, RBAC, users, teams, contacts, deals, tasks, notes, notifications, analytics, workspace settings, and the backend side of conversation actions.

## Removed Legacy Folder

`backend/api/` was a deprecated legacy Laravel application snapshot (duplicate routes, migrations, controllers, services, tests, and composer files that overlapped the active `backend/` application). It was not wired into Docker Compose, Nginx, the frontend, or the WhatsApp gateway.

It was removed as part of the dead-code cleanup. The full history remains available in git; the original audit note is archived at `docs/archive/backend-api-audit.md`.

A similar legacy folder, `backend/whatsapp-sync/`, was also removed (superseded by the active `whatsapp-gateway/` service).

## Maintenance Rules

- Add new Laravel API features only under `backend/`.
- Keep a single source of truth for controllers, models, policies, migrations, and services under `backend/` — never reintroduce a parallel legacy snapshot.
- Deployment scripts must continue to reference `backend/` and `whatsapp-gateway/`.
