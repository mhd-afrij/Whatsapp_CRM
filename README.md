# CRM-WhatsApp

A WhatsApp-first CRM & team collaboration platform: shared team inbox over a single linked
WhatsApp number, contacts/leads/deals pipelines, tasks, notes, labels, notifications, and
workspace administration with permission-based RBAC.

Services:
- `frontend/` — Next.js 14+ (App Router, TS strict, Tailwind, shadcn/ui, TanStack Query, Socket.IO client)
- `backend/` — Laravel 12 REST API (`/api/v1`), MySQL, Redis-backed queues, Sanctum auth
- `whatsapp-gateway/` — Node + TypeScript + Express + Baileys + BullMQ + Socket.IO, owns the WhatsApp connection and WhatsApp-origin data
- `infrastructure/` — docker-compose, nginx, monitoring, scripts

See `docs/` for the full design: architecture, database schema, API contract, permission matrix,
event catalog, data-ownership split, and the phased implementation roadmap.

## Prerequisites

- Docker + Docker Compose (recommended path)
- For local (non-docker) dev: Node.js 20+, PHP 8.2+, Composer 2, MySQL 8, Redis 7

## Quick start (Docker Compose)

```bash
cp .env.example .env
# fill in backend/.env, frontend/.env.local, whatsapp-gateway/.env from their .env.example files
# (the compose files also work with zero manual .env setup, using insecure dev-only
# defaults for WHATSAPP_GATEWAY_TOKEN / INTERNAL_GATEWAY_TOKEN / CREDENTIALS_ENCRYPTION_KEY —
# override these for anything beyond a throwaway sandbox)
docker compose up -d --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api/v1/health
- WhatsApp Gateway: http://localhost:4000/healthz
- MinIO console: http://localhost:9001
- Everything behind nginx: http://localhost:80

**Note:** `docker compose up` has never been run live in the environment this project was built
in (no Docker daemon available there — see `PROJECT_STATUS.md` Phase 19/20 for the manual
review-and-fix pass that was done in its place). Validate this in the first environment that has
Docker available: `docker compose config` first, then `docker compose up -d --build`.

## Local development (per service)

### backend/
```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed   # creates schema + seeds workspace/roles/permissions/admin user/pipeline
php artisan serve            # http://localhost:8000
php artisan test             # 196 tests
```

### frontend/
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev      # http://localhost:3000
npm run build
npm test         # vitest, 12 tests
npm run lint
```

### whatsapp-gateway/
```bash
cd whatsapp-gateway
npm install
cp .env.example .env
npm run dev       # http://localhost:4000
npm run build
npm test          # vitest, 51 tests
```

### e2e/ (Playwright, written but not yet executed in any environment used so far)
```bash
cd e2e
npm install
npx playwright install
npm test   # requires the full stack (backend+gateway+frontend+MySQL+Redis) running together
```

### Backup / restore (MySQL)
```bash
infrastructure/scripts/mysql-backup.sh          # writes storage/backups/<db>_<timestamp>.sql.gz
infrastructure/scripts/mysql-restore.sh <dump.sql.gz> [target_db]
```

## Project status

All 20 phases of the original roadmap are complete and independently verified in this
environment: backend (196/196 tests), whatsapp-gateway (51/51 tests), frontend (12/12 tests +
clean lint/build, 29 routes), migrate:fresh --seed against real MySQL, and a tested MySQL
backup/restore round trip. A Playwright E2E suite and a GitHub Actions CI workflow are written
and manifest-consistent but have never executed on a real browser/runner, and `docker compose up`
has never been run against a live Docker daemon — see `FINAL_REPORT.md` for the full,
itemized breakdown of what's genuinely verified vs. what still needs a live WhatsApp/SMTP/Docker
environment before shipping, and `PROJECT_STATUS.md` for the phase-by-phase history.

## Documentation index

| Doc | Purpose |
|---|---|
| `docs/01-requirements-summary.md` | Condensed functional/non-functional requirements |
| `docs/02-gap-analysis.md` | What exists vs. what's needed |
| `docs/03-system-architecture.md` | Container diagram, component responsibilities |
| `docs/04-database-design.md` | Full schema + ERD |
| `docs/05-api-contract.md` | `/api/v1` endpoint list |
| `docs/06-frontend-route-map.md` | Next.js route tree |
| `docs/07-permission-matrix.md` | Permissions × roles |
| `docs/08-implementation-roadmap.md` | Phase 0–20 roadmap |
| `docs/09-testing-strategy.md` | Testing approach per service |
| `docs/10-deployment-plan.md` | Deployment topology & operations |
| `docs/11-key-flows.md` | Message/QR/lead/reconnect sequence diagrams |
| `docs/DECISIONS.md` | Assumptions made |
| `docs/DATA_OWNERSHIP.md` | Which service writes which tables |
| `docs/EVENT_CATALOG.md` | Socket.IO realtime events |

## License

Proprietary — internal project.
