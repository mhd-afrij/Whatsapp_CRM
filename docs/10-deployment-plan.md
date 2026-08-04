# 10 — Deployment Plan

## 1. Environments

| Environment | Purpose | Notes |
|---|---|---|
| `dev` | Local development | `infrastructure/docker-compose.dev.yml`, hot-reload volumes, seeded demo data, Mailhog/log-based email, self-signed or no TLS |
| `staging` | Pre-prod verification | Mirrors prod compose topology, separate MySQL/Redis/MinIO volumes, real (test) WhatsApp number, deploy on every merge to `main` |
| `prod` | Live workspace deployment | `infrastructure/docker-compose.prod.yml`, TLS via Nginx + Let's Encrypt (or provided certs), backups enabled, monitoring enabled |

Each environment is a fully separate stack (separate DB, Redis, MinIO bucket) — no shared
infrastructure between staging and prod, since a workspace's WhatsApp session must not be
accidentally shared.

## 2. Compose Topology (prod)

Services in `docker-compose.prod.yml`:
- `nginx` — reverse proxy, TLS termination, routes `/` → frontend, `/api` → backend, `/ws` →
  gateway; serves as the single exposed port (443).
- `frontend` — `next start` behind Nginx, internal port only.
- `backend` — `php-fpm` + Nginx-in-container or a PHP built-in server behind the shared Nginx;
  internal port only.
- `backend-queue-worker` — `php artisan queue:work` (Redis driver), separate container so it
  scales/restarts independently of the web process.
- `backend-scheduler` — `php artisan schedule:work` (or cron) for reminders/periodic jobs.
- `gateway` — Express + Socket.IO + Baileys process, internal port only.
- `gateway-worker` — BullMQ worker process(es) for `outbound-messages`/`media-download`/
  `session-maintenance` queues, separate container from the Socket.IO/Express process so a
  worker crash doesn't drop live socket connections.
- `mysql` — MySQL 8, named volume, `my.cnf` tuned for the workload (max_connections, innodb
  buffer pool).
- `redis` — Redis 7, AOF persistence enabled (queue durability matters).
- `minio` — S3-compatible object storage, named volume, bucket created via init container/script.

All containers on an internal Docker network; only `nginx` publishes host ports 80/443.

## 3. Health Checks

| Service | Endpoint | Used by |
|---|---|---|
| backend | `GET /api/v1/health` (public, no auth) → DB + Redis ping | Docker healthcheck, Nginx upstream check, deploy gate |
| gateway | `GET /health` → DB + Redis + Baileys socket state | Docker healthcheck, deploy gate |
| frontend | `GET /api/health` (Next.js route handler) → backend reachability | Docker healthcheck |
| mysql/redis/minio | native healthcheck commands (`mysqladmin ping`, `redis-cli ping`, `mc ready`) | Compose `depends_on: condition: service_healthy` |

Compose `depends_on` chains ensure app services only start once `mysql`/`redis`/`minio` report
healthy, and deploy scripts poll `backend`/`gateway` health endpoints before flipping traffic.

## 4. Migration & Rollback Strategy

- **Backend**: `php artisan migrate --force` runs as a one-off deploy step (a short-lived
  container/job) **before** the new backend image is put into rotation. Migrations are written
  additive-first (add columns/tables nullable, backfill, then a later deploy tightens
  constraints) to keep the old and new backend versions compatible during a rolling deploy.
- **Gateway**: its own migration tool runs the same way as a pre-deploy step against its
  migration-owned tables.
- **Rollback**: because migrations are additive-first, rolling back the application image to
  the previous version does not require an automatic down-migration in the common case. For the
  rare destructive migration, a paired `down()`/rollback script is written and tested in staging
  before it ships to prod, and the deploy runbook requires a fresh DB backup immediately before
  running it.
- **Verification gate**: after migrating, run a smoke test (health check + one authenticated
  API call) before routing production traffic to the new containers.

## 5. Zero-Downtime Notes

- Backend and gateway are stateless at the process level (session/queue state lives in
  Redis/MySQL), enabling a simple blue/green or rolling restart: start new containers, wait for
  health checks, drain/stop old containers.
- The **gateway's Baileys connection is the one stateful exception**: only one process should
  hold the live WhatsApp socket at a time. Deploy strategy for `gateway`: stop the old
  container's Baileys connection cleanly (graceful shutdown hook releases the socket and lets
  in-flight BullMQ jobs finish or requeue), *then* start the new container, which reloads
  persisted credentials from `whatsapp_session_credentials` and reconnects. This is a short
  (seconds-scale) gap in WhatsApp connectivity per deploy, acceptable given a single linked
  number; BullMQ retains queued outbound jobs across the gap.
- `nginx` config uses upstream keepalive and short-lived connection draining so in-flight HTTP
  requests complete against the old container before it's removed.
- Socket.IO clients (frontend) reconnect automatically on gateway restart; the frontend shows a
  transient "reconnecting" indicator rather than an error.

## 6. Backup Strategy

- **MySQL**: nightly full logical backup (`mysqldump` or `mydumper` for larger datasets) to a
  retained object storage location (a dedicated MinIO bucket or external S3), plus binary log
  retention for point-in-time recovery between nightly backups. Retention: 14 daily, 8 weekly.
- **MinIO (media)**: versioning enabled on the bucket; periodic sync to a secondary
  bucket/region for disaster recovery.
- **WhatsApp session credentials**: covered by the MySQL backup (they live in
  `whatsapp_session_credentials`); note that restoring an old backup may still require a fresh
  QR relink if WhatsApp has invalidated the session server-side in the interim — documented as
  an operational caveat, not something backups alone guarantee.
- **Restore drill**: staging environment is used quarterly to validate a full restore from prod
  backups.

## 7. Secrets & Configuration

- Per-service `.env` files, never committed; `.env.example` documents required keys.
- Shared secret for `/internal/*` API calls (`INTERNAL_API_SECRET`) generated per environment,
  injected via Docker Compose secrets or the host's secret manager, rotated on a defined
  schedule with a brief dual-secret acceptance window to avoid downtime during rotation.
- Gateway env is Zod-validated at boot (`env.ts`); a missing/invalid var fails fast with a clear
  error instead of starting in a broken state.

## 8. Monitoring & Alerting (operational baseline)

- Container-level restart/crash alerts.
- Queue depth and failed-job-count alerts (`failed_jobs` table, BullMQ failed queue) — a growing
  failed queue on outbound WhatsApp sends is a high-priority alert.
- WhatsApp connection status alert: if `whatsapp_sessions.status` stays `disconnected` beyond a
  threshold, notify admins (this doubles as a dogfood use of the platform's own notification
  system, or an external channel like email/Slack webhook for infra-level visibility).
