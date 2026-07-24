# WhatsApp CRM — Installation & Setup Guide

Three services run together locally:

| Service | Path | Tech | Port |
|---|---|---|---|
| Frontend | `Frontend/` | Vite + React 19 + TypeScript | `5173` |
| API | `Backend/api/` | Laravel 12 (PHP) | `8000` |
| WhatsApp sync | `Backend/whatsapp-sync/` | Node.js + Express + Baileys + Socket.io | `3100` |

All three must be running at once for the app to work end to end.

## Prerequisites

- PHP 8.2+ and Composer
- Node.js 20+ and npm
- MySQL 8+ (or MariaDB) reachable from both `api/` and `whatsapp-sync/`
- Redis (used by the API for sessions/cache/queue)

## 1. Database

Create a database and user matching what the `.env` files expect (defaults below — change the password before using this anywhere but a local machine):

```sql
CREATE DATABASE whatsapp_crm;
CREATE USER 'whatsapp_crm'@'localhost' IDENTIFIED BY 'change_me';
GRANT ALL PRIVILEGES ON whatsapp_crm.* TO 'whatsapp_crm'@'localhost';
```

Both `api/` and `whatsapp-sync/` connect to the **same** database — the API owns the CRM/auth/conversations tables; `whatsapp-sync` owns a single `whatsapp_sync_sessions` table it creates itself on first run.

## 2. Backend API (`Backend/api/`)

```bash
cd Backend/api
composer install
cp .env.example .env      # or edit the .env already committed for local dev
php artisan key:generate
php artisan migrate --seed
php artisan serve --port=8000
```

Key `.env` values to check:

```env
DB_HOST=127.0.0.1
DB_DATABASE=whatsapp_crm
DB_USERNAME=whatsapp_crm
DB_PASSWORD=change_me

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

FRONTEND_URL=http://localhost:5173
CORS_ALLOWED_ORIGINS=http://localhost:5173

SERVICE_TO_SERVICE_SECRET=<shared secret — must match whatsapp-sync's value>
WHATSAPP_SYNC_INTERNAL_BASE_URL=http://localhost:3100
WHATSAPP_SYNC_WEBHOOK_SECRET=       # leave blank to default to SERVICE_TO_SERVICE_SECRET
WHATSAPP_SYNC_DEFAULT_WORKSPACE_SLUG=demo
```

`CORS_ALLOWED_ORIGINS` must include the exact origin the frontend runs on (`http://localhost:5173` for `npm run dev`). If you change it, run `php artisan config:clear` and restart `php artisan serve` — env changes are not picked up by an already-running process.

Seeding creates a demo workspace, one login per role, sample CRM records, and a linked demo WhatsApp account with sample conversations:

| Email | Role | Password |
|---|---|---|
| owner@demo.test | Owner | password12345 |
| admin@demo.test | Administrator | password12345 |
| lead@demo.test | Team Lead | password12345 |
| agent@demo.test | Agent | password12345 |

Workspace: `demo`.

Checks: `./vendor/bin/pint --test`, `php artisan test`.

## 3. WhatsApp sync service (`Backend/whatsapp-sync/`)

```bash
cd Backend/whatsapp-sync
npm install
cp .env.example .env      # or edit the .env already committed for local dev
npm run dev                # http://localhost:3100
```

Key `.env` values:

```env
MYSQL_HOST=127.0.0.1
MYSQL_DATABASE=whatsapp_crm
MYSQL_USER=whatsapp_crm
MYSQL_PASSWORD=change_me

CORS_ORIGIN=http://localhost:5173
SERVICE_TO_SERVICE_SECRET=<same shared secret as api/.env>
LARAVEL_API_BASE_URL=http://localhost:8000/api/v1
WHATSAPP_AUTH_DIR=storage/wa-auth
```

`SERVICE_TO_SERVICE_SECRET` must be **identical** in both `api/.env` and `whatsapp-sync/.env` — it authenticates calls in both directions (API → sync service for session/QR/send actions, sync service → API webhook for inbound messages and session-state pushes).

The first time you connect a real WhatsApp account: open **Settings → WhatsApp Connection** in the app, click **Generate QR code**, and scan it from WhatsApp on your phone (Linked Devices). Connection state and QR codes update live over Socket.io.

Checks: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`.

## 4. Frontend (`Frontend/`)

```bash
cd Frontend
npm install
cp .env.example .env.local   # or edit the .env.local already committed for local dev
npm run dev                  # http://localhost:5173
```

Key `.env.local` values:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
VITE_SYNC_BASE_URL=http://127.0.0.1:3100
```

Checks: `npx tsc --noEmit`, `npx eslint .`, `npm run build`.

## 5. Log in

1. Make sure all three services are running (API on `:8000`, sync on `:3100`, frontend on `:5173`).
2. Open `http://localhost:5173/login`.
3. Workspace `demo`, e.g. `admin@demo.test` / `password12345`.

## Troubleshooting

- **"Something went wrong. Please try again." on login** — almost always a CORS mismatch between `CORS_ALLOWED_ORIGINS` (api) and the actual frontend origin, or the API not running. Check the browser devtools Network tab for a blocked/failed request, fix `.env`, then `php artisan config:clear` and restart `php artisan serve`.
- **Inbox stays empty** — the WhatsApp account isn't linked yet (Settings → WhatsApp Connection), or `whatsapp-sync` can't reach the API webhook (`LARAVEL_API_BASE_URL` / `SERVICE_TO_SERVICE_SECRET` mismatch — check the `whatsapp-sync` process logs for `laravel webhook call failed/errored`).
- **QR code never appears** — `whatsapp-sync` needs outbound internet access to WhatsApp's servers to start a real pairing session; check its logs for connection errors.
- **`/health` or `/ready` return 503** — usually MySQL or Redis unreachable from that service; verify the DB/Redis credentials in the relevant `.env`.
