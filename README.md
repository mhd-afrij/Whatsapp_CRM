# CRM-WhatsApp

A WhatsApp-first CRM & team collaboration platform: shared team inbox over a single linked
WhatsApp number, contacts/leads/deals pipelines, tasks, notes, labels, notifications, and
workspace administration with permission-based RBAC.

Deployed on **Render Free Tier** paired with **Supabase** (PostgreSQL & Storage).

Services:
- `frontend/` — Next.js 14+ (App Router, TS strict, Tailwind, shadcn/ui, TanStack Query, Socket.IO client)
- `backend/` — Laravel 12 REST API (`/api/v1`), Supabase PostgreSQL, database-backed queues, Sanctum auth
- `whatsapp-gateway/` — Node + TypeScript + Express + Baileys + pg-boss + Socket.IO, owns the WhatsApp connection and WhatsApp-origin data
- `infrastructure/` — docker-compose, scripts, Render blueprints

See `docs/` for the full design: architecture, database schema, API contract, permission matrix,
event catalog, data-ownership split, and deployment guides.

## Prerequisites

- Docker + Docker Compose (recommended path)
- For local (non-docker) dev: Node.js 20+, PHP 8.2+, Composer 2, PostgreSQL 15+

## Quick start (Docker Compose)

```bash
cp .env.example .env
# fill in backend/.env, frontend/.env.local, whatsapp-gateway/.env from their .env.example files
docker compose up -d --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api/v1/health
- WhatsApp Gateway: http://localhost:4000/healthz

## Local development (per service)

### backend/
```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed   # creates schema + seeds workspace/roles/permissions/admin user/pipeline
php artisan serve            # terminal 1 - http://localhost:8000
php artisan queue:work       # terminal 2 - report exports/campaigns/webhooks
php artisan test             # runs PHPUnit tests
```

### frontend/
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev      # http://localhost:3000
npm run build
npm test         # vitest
npm run lint
```

### whatsapp-gateway/
```bash
cd whatsapp-gateway
npm install
cp .env.example .env
npm run dev       # http://localhost:4000
npm run build
npm test          # vitest
```

### Backup / restore (PostgreSQL)
```bash
infrastructure/scripts/postgres-backup.sh          # writes storage/backups/<db>_<timestamp>.sql.gz
infrastructure/scripts/postgres-restore.sh <dump.sql.gz> [target_db]
```

## Documentation index

| Doc | Purpose |
|---|---|
| `DEPLOYMENT.md` | Production Render Free + Supabase setup guide |
| `docs/render-deployment.md` | Render Blueprint architecture and service mapping |
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
