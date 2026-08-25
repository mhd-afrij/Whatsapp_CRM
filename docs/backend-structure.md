# Backend Structure

## Active Backend

`backend/` is the active Laravel CRM API.

Evidence:

- `docker-compose.yml` builds the `backend` service from `./backend`.
- The frontend default API URL points at `http://localhost:8000/api/v1` served by `backend/`.
- The gateway calls `http://backend:8000/api/internal` on the compose network.
- The top-level README documents `backend/` as the Laravel 12 REST API.
- No deployment, compose, frontend, or gateway reference outside `backend/api/` points to `backend/api/`.

`backend/` owns CRM business logic: auth, RBAC, users, teams, contacts, deals, tasks, notes, notifications, analytics, workspace settings, and the backend side of conversation actions.

## Deprecated Folder

`backend/api/` is a deprecated legacy Laravel application snapshot. It contains its own routes, migrations, controllers, services, tests, and composer files that overlap with the active `backend/` application.

It is not currently wired into Docker Compose, Nginx, the frontend, or the WhatsApp gateway. Do not add new features there.

An audit note is stored at `docs/archive/backend-api-audit.md` so future maintainers know why the folder is not part of the runtime path.

## Maintenance Rules

- Add new Laravel API features only under `backend/`.
- Do not duplicate controllers, models, policies, migrations, or services between `backend/` and `backend/api/`.
- If a useful implementation exists only in `backend/api/`, port it into `backend/` with tests, then leave a note in the relevant PR or changelog.
- Deployment scripts must continue to reference `backend/`, never `backend/api/`.
- Before deleting `backend/api/`, create a tagged repository backup or artifact archive and run the full backend, gateway, frontend, and e2e suites.
