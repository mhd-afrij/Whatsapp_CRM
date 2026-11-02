# CRM-WhatsApp

A WhatsApp-first CRM & team collaboration platform: shared team inbox over a single linked WhatsApp number, contacts/leads/deals pipelines, tasks, notes, labels, notifications, and workspace administration with permission-based RBAC.

Deployed on **Render Free Tier** paired with **Supabase** (PostgreSQL & Storage).

## Services

- `frontend/` — Next.js 16 (App Router, TypeScript strict, Tailwind, shadcn/ui, TanStack Query, Socket.IO client)
- `backend/` — Laravel 12 REST API (`/api/v1`), Supabase PostgreSQL, database-backed queues, Sanctum auth
- `whatsapp-gateway/` — Node.js 20 + TypeScript + Express + Baileys + pg-boss + Socket.IO, manages the WhatsApp connection and session persistence
- `scripts/` — PostgreSQL backup and restore operational utilities
- `docs/` — Architectural designs, API specifications, and deployment runbooks

---

## Prerequisites

- For Docker deployment: Docker + Docker Compose
- For local dev: Node.js 20+, PHP 8.2+ (with `pdo_pgsql`), Composer 2, PostgreSQL 15+

---

## Quick start (Docker Compose)

```bash
cp .env.example .env
# Fill in Supabase credentials and shared keys in .env
docker compose up -d --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api/v1/health
- WhatsApp Gateway: http://localhost:4000/healthz

---

## Local Development (Per Service)

### Backend (`backend/`)
```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed   # creates schema + seeds workspace/roles/permissions/admin user
php artisan serve            # terminal 1 - http://localhost:8000
php artisan queue:work       # terminal 2 - report exports/campaigns/webhooks
php artisan test             # runs PHPUnit tests
```

### Frontend (`frontend/`)
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev      # http://localhost:3000
npm run build
npm test         # vitest
```

### WhatsApp Gateway (`whatsapp-gateway/`)
```bash
cd whatsapp-gateway
npm install
cp .env.example .env
npm run dev       # http://localhost:4000
npm run build
npm test          # vitest
```

### Database Backup & Restore (PostgreSQL)
```bash
./scripts/postgres-backup.sh          # writes backend/storage/backups/<db>_<timestamp>.sql.gz
./scripts/postgres-restore.sh <dump.sql.gz> [target_db]
```

---

## Documentation Index

See [`docs/README.md`](docs/README.md) for the comprehensive documentation directory.

| Category | Document | Description |
|---|---|---|
| **Deployment** | [`DEPLOYMENT.md`](DEPLOYMENT.md) | Production Render Free + Supabase setup guide |
| **Deployment** | [`docs/deployment/render-deployment.md`](docs/deployment/render-deployment.md) | Render Blueprint architecture and service mapping |
| **Deployment** | [`docs/deployment/production-deployment.md`](docs/deployment/production-deployment.md) | Production deployment standards and operations |
| **Deployment** | [`docs/deployment/security-checklist.md`](docs/deployment/security-checklist.md) | Pre-production security auditing checklist |
| **Architecture** | [`docs/architecture/03-system-architecture.md`](docs/architecture/03-system-architecture.md) | System architecture & component responsibilities |
| **Architecture** | [`docs/architecture/04-database-design.md`](docs/architecture/04-database-design.md) | Database schema & relationships |
| **Architecture** | [`docs/architecture/ACCESS_LIST.md`](docs/architecture/ACCESS_LIST.md) | RBAC permission catalog (41+ permissions, 5 roles) |
| **Architecture** | [`docs/architecture/DATA_OWNERSHIP.md`](docs/architecture/DATA_OWNERSHIP.md) | Service data ownership boundaries |
| **Architecture** | [`docs/architecture/EVENT_CATALOG.md`](docs/architecture/EVENT_CATALOG.md) | Real-time WebSocket and internal event catalog |
| **Architecture** | [`docs/architecture/DECISIONS.md`](docs/architecture/DECISIONS.md) | Architectural Decision Records (ADRs) |
| **API** | [`docs/api/05-api-contract.md`](docs/api/05-api-contract.md) | REST API endpoints and payload specifications |
| **Archive** | [`docs/archive/`](docs/archive/) | Legacy roadmaps, sprint notes, and initial specs |

---

## License

Proprietary — internal project.
