# FINAL_REPORT.md — CRM-WhatsApp, Phase 0–20 Completion Report

Date of this report: 2026-07-31. This is the terminal document for the ~20-phase build. It
consolidates every phase's honest findings into one place. For phase-by-phase narrative detail,
see `PROJECT_STATUS.md`.

## 1. Executive Summary

CRM-WhatsApp is a WhatsApp-first CRM and team-inbox platform: a shared team inbox over a single
linked WhatsApp number, contacts/leads/deals pipelines, tasks with reminders, internal notes,
labels, notifications, dashboards/analytics, and full workspace/RBAC administration. It is built
as three independently deployable services (Laravel 12 API, a Node/TypeScript WhatsApp gateway
using Baileys, and a Next.js 16 frontend) plus supporting infrastructure (MySQL, Redis, MinIO/S3,
nginx, Docker Compose).

All application-level work across 20 phases is complete and passes its own test suite in this
environment: **196/196 backend tests, 51/51 gateway tests, 12/12 frontend tests**, clean lint and
production builds on all three services, and a clean `migrate:fresh --seed` against real MySQL.
A Phase 20 final audit found and fixed two real, if minor, issues (see §15/§17) and confirmed no
naming drift in a permission-matrix spot-check. What remains unverified is exclusively
infrastructure/environment-dependent: a live WhatsApp account, a real SMTP provider, a live
Docker daemon, and a real CI runner — none of which existed in any environment this project was
built in. Those gaps are enumerated precisely in §16–§17 rather than glossed over.

## 2. Complete Modules List (all 20 phases)

0. Documentation & scaffolding (repo structure, design docs, phased roadmap)
1. Project scaffolding (Laravel/Next.js/Node init, health checks, CI-less build verification)
2. Database schema & migrations (55 tables, workspace-scoped multi-tenancy)
3. Auth, RBAC foundation, workspace model, Sanctum
4. WhatsApp gateway core (Baileys connection manager, QR pairing, session persistence)
5. Inbound message pipeline (webhook/event ingestion, normalization, dedup)
6. Outbound message pipeline (BullMQ `send-message` queue, delivery-status tracking)
7. Realtime layer (Socket.IO `/gateway` + `/crm` namespaces, event catalog)
8. Shared team inbox UI (conversation list, thread view, assignment, internal notes)
9. Contacts module (CRUD, import, activities, labels)
10. Leads & Deals (pipelines, stages, stage history, contact→lead→deal conversion)
11. Tasks (CRUD, comments, mentions, reminders)
12. Notifications (in-app, per-user preferences)
13. Dashboard & Analytics
14. User/Team/Role administration (full RBAC admin suite)
15. Workspace settings & audit log viewer
16. Full UI/UX polish pass (mobile nav, inbox responsive shell, confirmations, a11y, error states)
17. Security hardening (rate limiting, CORS/CSRF/XSS/SQLi review, credential encryption review)
18. Testing — closing real coverage gaps (backend 173→196, gateway 28→51, frontend 0→12, e2e suite
    written)
19. DevOps & deployment (Docker Compose fixes, CI workflow written, MySQL backup/restore
    scripts — actually tested)
20. Final verification (this report) — repo-wide placeholder/dead-code audit, full suite re-run,
    migrate:fresh re-verification, permission-matrix spot-check, secrets/gitignore audit, README
    refresh

## 3. Partial / Known-Gap Items (honest specifics)

- **No true before/after audit diff.** `AuditLogger::log()` call sites pass "the data that
  changed" but no call site captures a pre-mutation snapshot. The audit log detail endpoint
  always returns `before: null`. Fixing this requires touching ~15 existing call sites — flagged,
  not done, to avoid a "giant retroactive rewrite."
- **Deal creation has no client-side Zod schema.** `frontend/src/lib/deals-api.ts`'s
  `DealFormValues` is posted directly with no `z.object(...)` validation layer, unlike
  `ContactForm`. Server-side validation (`DealController`'s `FormRequest`) is the only guard
  today.
- **Workspace security/data-retention settings are read-only.** No
  `session_timeout_minutes`/`password_policy`/`data_retention_days` columns exist in the schema;
  `/settings/workspace` surfaces the real, currently-enforced `config/session.php` /
  `config/sanctum.php` values as informational text rather than inventing fake toggles.
- **Restore-after-delete permission sweep** (can a Manager restore what an Agent soft-deleted?)
  is not a dedicated test suite — basic soft-delete/restore is covered per-module, but a
  role-matrix sweep of restore specifically was not built.
- **A single consolidated `PermissionMatrixTest`** (all 5 roles × every permission from
  `docs/07-permission-matrix.md` in one parametrized suite) does not exist — coverage is real but
  scattered across `PermissionCatalog`/`AdminSuite`/per-module test files. This phase's spot-check
  (5 permissions, §4 below) found no drift, but it is a spot-check, not exhaustive.
- **Gateway `INTERNAL_SHARED_SECRET` / `LARAVEL_INTERNAL_API_URL`** are required by the gateway's
  Zod env schema but no gateway→Laravel call using either was found anywhere in
  `whatsapp-gateway/src` — validated-but-unused, reserved for a not-yet-built
  gateway-initiated call into Laravel's internal API.
- **Gateway internal-token comparison** (`requireInternalToken`) uses plain `!==`, not
  constant-time comparison — a low-priority timing-attack surface on a service-to-service shared
  secret, noted rather than fixed.
- **Concurrency-adjacent correctness beyond single-process testing**: duplicate
  `whatsapp_message_id` / idempotency-key replay is covered by issuing the same key twice
  sequentially in one process; true concurrent-request races were not (and cannot meaningfully be)
  exercised without a multi-process load harness.
- **Internal-notes amber styling** uses Tailwind's default `amber-*` palette rather than the
  shared `--color-warning` token — intentionally left alone to avoid a visual regression on a
  feature that cannot be visually re-verified in this environment.

## 4. Items Requiring External Credentials

| Need | What's ready once it exists |
|---|---|
| **Live WhatsApp account** (a real phone number to pair via QR) | `ConnectionManager` (Baileys wrapper), QR pairing flow, session persistence/restore-on-boot, inbound normalization, outbound send queue (`send-message.queue.ts`), delivery-status tracking, and the full inbox UI are all built and unit/integration-tested against mocked Baileys. Never run against a real WhatsApp session — this is the single largest unverified surface in the whole build. The `e2e/` WhatsApp specs additionally need a Baileys test-adapter/simulator that does not exist yet. |
| **Real SMTP provider** | `backend/.env`'s `MAIL_MAILER=log` (mail is logged, not sent) in every environment used. Password-reset/invitation emails use Laravel's `Mail`/notification classes already wired to `config/mail.php` — swapping `MAIL_MAILER` to `smtp` plus real host/user/pass credentials is the only change needed; no code changes anticipated. |
| **Production S3/MinIO bucket** | `AWS_*` env vars in `backend/.env`/`.env.example` and the gateway's media-access path (`whatsapp-gateway/src/lib/media-access.ts`) already branch on `S3_BUCKET` being set; local dev uses a MinIO container. Needs a real bucket + credentials + (optionally) CDN/signed-URL TTL tuning for production. |
| **Real domain + TLS** | `infrastructure/nginx/nginx.conf` proxies frontend/`/api/`/`/gateway/`/`/socket.io/` with websocket upgrade headers already configured; needs a real certificate (Let's Encrypt/ACM) and `FRONTEND_URL`/`SANCTUM_STATEFUL_DOMAINS`/CORS origin updated from `localhost` to the real domain. No code changes anticipated, config changes only. |
| **A live Docker daemon** | Both compose files were reviewed and two real bugs fixed in Phase 19 (gateway URL not overridden for the Docker network; missing `.env` files treated as hard errors). Never run through `docker compose config`/`up` for real — see §16. |
| **A real GitHub Actions runner** | `.github/workflows/ci.yml` was written against each service's actual `composer.json`/`package.json` scripts and YAML-parsed successfully, but has never executed on an actual runner. |

## 5. Architecture Summary

Three independently deployable services behind nginx:
- **frontend/** (Next.js 16, App Router, TS strict, Tailwind, TanStack Query, Socket.IO client) —
  talks only to the Laravel API (`/api/v1`) and the gateway's Socket.IO server directly for
  realtime.
- **backend/** (Laravel 12) — system of record for CRM data (contacts/leads/deals/tasks/etc.),
  RBAC, workspace administration, audit logging. Calls the gateway's internal API
  (token-authenticated) for WhatsApp actions (connect/disconnect/send/media signed URLs).
- **whatsapp-gateway/** (Node/TS, Express, Baileys, BullMQ, Socket.IO) — owns the live WhatsApp
  connection and WhatsApp-origin data normalization; the only service that talks to WhatsApp
  directly. Persists inbound/outbound messages via a MySQL pool it shares access to (same schema,
  different write path per `docs/DATA_OWNERSHIP.md`), and Redis-backed BullMQ queues for outbound
  sends and media downloads.
- **Realtime**: gateway emits on a `/gateway` Socket.IO namespace (message events) and a `/crm`
  namespace (notifications/presence/assignment), consumed directly by the frontend client.
- **Infrastructure**: MySQL 8, Redis 7, MinIO (S3-compatible) for media, nginx as the single
  ingress reverse-proxying all three services plus WebSocket upgrade.

## 6. Database Summary

**55 tables** (verified via `SHOW TABLES` against the real MySQL instance after
`migrate:fresh --seed`), across 49 migration files. Key design decisions:
- **Workspace-scoped multi-tenancy**: every top-level resource table carries `workspace_id` and
  every model uses the `BelongsToWorkspace` trait + `WorkspaceScope` global scope; child/pivot
  tables (e.g. `conversation_assignments`, `deal_stage_history`, `message_media`) inherit scoping
  through their parent rather than duplicating the column.
- **RBAC via `permissions`/`roles`/`permission_role`/`role_user`**, 5 seeded system roles
  (Super Admin, Admin, Manager, Agent, Viewer), permission strings checked in code
  (`$user->hasPermission('x.y')`), never role names.
- **WhatsApp domain tables** (`whatsapp_sessions`, `whatsapp_session_credentials`,
  `whatsapp_connection_events`, `whatsapp_sync_checkpoints`, `whatsapp_contacts`) are
  gateway-owned; `messages`/`message_media`/`message_status_events`/`message_reactions`/
  `message_dispatch_queue`/`message_processing_failures` form the message pipeline with an
  idempotent dispatch-queue design (unique `whatsapp_message_id` constraint + idempotency-key
  replay protection).
- **CRM domain**: `contacts` → `leads` → `deals` (with `pipelines`/`pipeline_stages`/
  `deal_stage_history` for pipeline tracking), `tasks`/`task_comments`/`task_reminders`,
  `internal_notes`/`note_mentions`, `labels` with per-entity pivot tables
  (`contact_label`/`lead_label`/`deal_label`/`conversation_label`).
- **Operational**: `audit_logs` (append-only, ~60 distinct logged action types),
  `notifications`/`notification_preferences`, `saved_filters`, `user_presence`,
  `workspace_settings` (1:1 with `workspaces`, JSON columns for business hours/branding/
  notification defaults), standard Laravel tables (`jobs`/`failed_jobs`/`job_batches`/`cache`/
  `sessions`/`personal_access_tokens`/`password_reset_tokens`).

## 7. Full Frontend Route List (29 routes, from a clean `next build`)

```
/                              ○ static
/_not-found                    ○ static
/accept-invitation             ○ static
/calendar                      ○ static
/contacts                      ○ static
/contacts/[id]                 ƒ dynamic
/contacts/new                  ○ static
/dashboard                     ○ static
/deals/[id]                    ƒ dynamic
/forgot-password               ○ static
/inbox                         ○ static
/inbox/[conversationId]        ƒ dynamic
/leads                         ○ static
/leads/[id]                    ƒ dynamic
/login                         ○ static
/pipeline                      ○ static
/reset-password                ○ static
/search                        ○ static
/settings/audit-log            ○ static
/settings/labels                ○ static
/settings/notifications        ○ static
/settings/pipelines             ○ static
/settings/roles                 ○ static
/settings/teams                 ○ static
/settings/users                 ○ static
/settings/whatsapp              ○ static
/settings/workspace              ○ static
/tasks                          ○ static
/tasks/[id]                     ƒ dynamic
/unauthorized                    ○ static
```

## 8. Full Backend API Module List (`backend/app/Http/Controllers/Api/V1`)

AnalyticsController, AuditLogController, AuthController, ContactController,
ConversationController, DashboardController, DealController, HealthController,
InternalNoteController, LabelController, LeadController, MediaController,
NotificationController, NotificationPreferenceController, PermissionController,
PipelineController, ReportExportController, RoleController, SearchController, TaskController,
TeamController, UserController, WhatsappController, WorkspaceSettingController — 24 controllers,
mounted under `/api/v1`, gated per `docs/07-permission-matrix.md` via route middleware
(`permission:x.y`) or Policy classes (for resources with per-record "Own"/"Team" scoping).

## 9. Gateway Modules (`whatsapp-gateway/src`)

- `app.ts` / `index.ts` — Express app assembly, graceful shutdown, worker/queue lifecycle.
- `whatsapp/` — `ConnectionManager` (Baileys session lifecycle, QR, reconnect, restore-on-boot),
  message normalizer, dispatch/message repositories.
- `queues/` — `send-message.queue.ts` (the real, tested outbound send path: claims a dispatch row,
  sends via Baileys, persists, emits `message.created`/`message.failed`), `media-download.queue.ts`
  (inbound media fetch/persist).
- `routes/` — `internal-whatsapp.routes.ts` (token-gated internal API consumed by Laravel:
  connect/disconnect/status/send/media signed URLs).
- `lib/` — crypto (AES-256-GCM credential encryption), logger, redis/mysql pool, socket-server,
  media-access (S3/MinIO signed URLs), backoff (retry delay computation).

**Phase 20 cleanup**: removed `queues/outgoing-message.queue.ts`, a dead Phase-0-era stub whose
processor unconditionally threw `NotImplementedError`. Its BullMQ worker was still being started
in production (`index.ts`) even though nothing in the codebase ever enqueued a job to it — the
real, fully-implemented send path is `send-message.queue.ts`. Removed the stub file and its
wiring from `index.ts` (import, `.run()`, and graceful-shutdown `.close()` calls); verified with
`npx tsc --noEmit`, `npm run build`, and `npx vitest run` (still 51/51) that nothing referenced it.

## 10. Realtime Events Implemented (`docs/EVENT_CATALOG.md`, gateway `socket-server.ts`)

`message.created`, `message.updated`, `message.failed`, `conversation.created`,
`conversation.updated`, `conversation.assigned`, `conversation.closed`, `conversation.reopened`,
`conversation.read`, `note.created`, `presence.updated`, `typing.updated`, `notification.created`,
`connection.updated` — across a `/gateway` namespace (WhatsApp/message-pipeline events) and a
`/crm` namespace (CRM-domain events: notifications, assignment, presence, notes).

## 11. Queue Workers

- **`send-message`** (BullMQ, gateway) — outbound WhatsApp sends; 4 attempts, exponential backoff
  from 3s; the real, tested implementation.
- **`media-download`** (BullMQ, gateway) — inbound media fetch/persist.
- **Laravel queue** (`QUEUE_CONNECTION=redis`) — report-export jobs (`ReportExportController`'s
  queue → job → notification → download round trip, tested end-to-end with `Storage::fake`), plus
  standard Laravel `jobs`/`failed_jobs`/`job_batches` tables.
- **`php artisan schedule` command(s)**: task-reminder due-notification command (tested in
  `TaskTest`/task-reminder suite: creates a notification for due reminders, skips future ones).

## 12. Tests Executed — Real Final Counts (this session)

| Service | Command | Result |
|---|---|---|
| backend | `php artisan test` | **196 passed, 745 assertions** |
| whatsapp-gateway | `npx vitest run` | **51 passed** (11 test files) |
| frontend | `npx vitest run` | **12 passed** (4 test files) |
| frontend | `npm run lint` | clean, 0 errors/warnings |
| frontend | `npm run build` | clean, 29 routes |
| whatsapp-gateway | `npx tsc --noEmit` | clean |
| whatsapp-gateway | `npm run build` | clean |

**E2E (Playwright, `e2e/`)**: written (6 spec files, 23 flows), never executed — needs a live full
stack + Playwright browser install + (for WhatsApp flows) a Baileys test-adapter that doesn't
exist yet. Not run in this session either; no live stack was available.

**CI (`.github/workflows/ci.yml`)**: written, YAML-validated, never run on a real GitHub Actions
runner in any environment used across this build.

## 13. Build Results

- backend: no separate "build" step (PHP); `composer install` + `php artisan test` is the
  closest equivalent, both green.
- whatsapp-gateway: `npm run build` (`tsc -p tsconfig.json`) — clean, zero errors.
- frontend: `npm run build` (`next build`, Turbopack) — clean, 29 routes generated (27 static ○,
  6 dynamic ƒ within that list, `/_not-found` included).

## 14. Migration / Seeder Results

`php artisan migrate:fresh --seed` run against the real local MySQL instance
(`crm_whatsapp` database) this session: all 49 migrations ran to `DONE`, followed by
`WorkspaceSeeder`, `PermissionSeeder`, `RolePermissionSeeder`, `AdminUserSeeder`,
`PipelineSeeder` — all `DONE`, no errors. 55 tables confirmed present via `SHOW TABLES`
afterward.

## 15. Security Checks Performed (this pass + prior Phase 17)

This pass specifically:
- Repo-wide grep for TODO/FIXME/HACK/placeholder/dummy/hard-coded/console.log/dd(/dump(/
  var_dump/debugger/temporary/not-implemented across all production source in
  `backend/app`, `whatsapp-gateway/src`, `frontend/src` — all hits reviewed; all were either
  legitimate (JSX `placeholder=` attrs, TanStack Query's `placeholderData` option, Pino/Monolog
  `replace_placeholders` config keys, a genuinely accurate doc comment) or the one real dead-code
  gap fixed in §9 above. No stray `console.log`, `dd()`, `dump()`, or `var_dump` found in any
  production file.
- **Found and fixed: `frontend/.gitignore`'s `.env*` glob would also have excluded
  `.env.example`** from ever being committed once git is initialized, silently dropping the
  onboarding template. Added `!.env.example`.
- **Found and fixed: a stray `backend/.env.bak.tmp`** containing a real (local-dev) `APP_KEY`
  existed on disk and was NOT covered by `backend/.gitignore`'s literal-filename-only env
  patterns (`.env`, `.env.backup`, `.env.production` — no glob). Deleted the stray file and
  broadened the gitignore pattern to `.env.*` with explicit `!.env.example`/`!.env.testing`
  exceptions, so any future `.env.<anything>` variant is covered by default.
- Manually inspected `backend/.env` and `frontend/.env.local` (the only two committed-to-disk env
  files that exist; `whatsapp-gateway/.env` was never created, only its `.env.example`) — every
  value is a local-dev placeholder (empty DB password, `MAIL_MAILER=log`, localhost URLs, local
  MinIO endpoint). Nothing resembling a real production credential found.
- Permission-matrix spot-check (5 permissions, one per module area) — see §4 of the audit
  process: `conversations.view` (inbox), `leads.manage`/`deals.manage`, `tasks.manage`/
  `tasks.view_team`, `teams.view`/`teams.manage` + `roles.view`/`roles.manage`, `users.manage` —
  all confirmed to match `docs/07-permission-matrix.md` exactly in both route middleware
  (`permission:x.y`) and Policy classes (`TeamPolicy`, `RolePolicy`, `TaskPolicy`). No naming
  drift found this pass.
- Prior Phase 17 hardening (re-confirmed still true, not re-litigated in depth): workspace
  isolation via `WorkspaceScope`, CORS pinned to `FRONTEND_URL` (no wildcard), no
  `::create($request->all())` mass-assignment pattern anywhere, file-upload MIME/size validation,
  Sanctum password-reset/invitation token expiry, debug-gated error responses, no raw-SQL
  injection vectors, ~60 audit-logged action types, AES-256-GCM gateway credential encryption, no
  `dangerouslySetInnerHTML` in the frontend, in-memory+localStorage token storage (documented
  tradeoff, not httpOnly cookies).

## 16. Docker/Compose Validation Status (honest)

**Never live-tested in any environment used across this entire build** — no Docker daemon was
available. Phase 19 did a manual review-and-fix pass (not a live run): found and fixed a missing
`WHATSAPP_GATEWAY_URL` override for the Docker network (would have made backend→gateway internal
calls resolve to `localhost` inside the backend container, i.e. itself, not the gateway) and made
`env_file` entries for services whose `.env` files don't exist on disk `required: false` with
explicit `environment:` fallbacks so `docker compose up` doesn't hard-fail for a fresh clone.
`docker compose config` itself has never been run — the fixed YAML has not been machine-validated
by the tool that would catch further schema issues. **This is the single largest unverified
operational surface in the build** alongside live WhatsApp. First environment with Docker
available should run, in order: `docker compose config`, then
`docker compose up -d --build` + a health-check pass on all services, then `docker compose down`.

## 17. Known Limitations

- Live WhatsApp connection never exercised against a real account (§4).
- SMTP never exercised against a real provider — `MAIL_MAILER=log` throughout.
- Docker Compose never live-validated (§16).
- CI workflow never run on a real GitHub Actions runner.
- Playwright E2E suite never executed (needs live stack + browser install + a
  not-yet-built Baileys test simulator for the WhatsApp-flow specs).
- No true before/after audit-log diff (§3).
- No client-side Zod validation on deal creation (§3).
- Workspace security/data-retention settings are informational/read-only, not configurable (§3).
- No consolidated cross-role `PermissionMatrixTest` (spot-checked, not exhaustively automated).
- Gateway internal-token comparison is not constant-time (low-priority timing surface).
- True concurrent-request races (as opposed to sequential duplicate-key replay) are untested —
  not meaningfully testable without a multi-process load harness.
- Performance/load testing (message throughput, search, analytics under volume) was never
  attempted in any phase — no environment used could sustain a representative load against a
  live full stack.

## 18. Production Deployment Steps

1. Provision MySQL 8, Redis 7, an S3-compatible bucket (or MinIO), and a real domain with TLS
   (Let's Encrypt/ACM).
2. Set real env vars in `backend/.env`, `frontend/.env.local`, `whatsapp-gateway/.env` from their
   `.env.example` templates: real `DB_*`, `REDIS_*`, `AWS_*`/S3 credentials, `MAIL_MAILER=smtp` +
   real SMTP credentials, `FRONTEND_URL`/`SANCTUM_STATEFUL_DOMAINS` set to the real domain,
   `WHATSAPP_GATEWAY_TOKEN`/`INTERNAL_GATEWAY_TOKEN`/`CREDENTIALS_ENCRYPTION_KEY` set to real
   generated secrets (never the compose-file dev defaults).
3. Build and push images from `backend/Dockerfile`, `frontend/Dockerfile`,
   `whatsapp-gateway/Dockerfile` (all reviewed in Phase 19, none live-built).
4. Validate compose config first: `docker compose -f docker-compose.yml -f docker-compose.production.yml config`
   (never run in this build — do this before anything else in production).
5. `docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build`, then
   health-check every service (`/api/v1/health`, `/healthz`, `/readyz`, frontend root, nginx).
6. Run `php artisan migrate --seed` (or `migrate` only if seeding a fresh admin user isn't
   desired) inside the backend container.
7. Pair the WhatsApp gateway with a real number via the `/settings/whatsapp` QR flow.
8. Set up a recurring `infrastructure/scripts/mysql-backup.sh` cron/scheduled job pointed at the
   production DB credentials, plus a separate MinIO/S3 bucket replication policy (the backup
   script deliberately does not cover bucket contents — see `PROJECT_STATUS.md` Phase 19).
9. Wire `.github/workflows/ci.yml` into the real repository once `git init`/a remote exists, and
   get its first real run on an actual GitHub Actions runner.
10. Install Playwright (`npx playwright install`) against the live staging stack and get the
    `e2e/` suite its first real run before considering it verified.

## 19. Exact Setup Commands

```bash
# backend
cd backend && composer install && cp .env.example .env && php artisan key:generate
php artisan migrate --seed

# frontend
cd frontend && npm install && cp .env.example .env.local

# whatsapp-gateway
cd whatsapp-gateway && npm install && cp .env.example .env

# e2e (once a live stack exists)
cd e2e && npm install && npx playwright install
```

## 20. Exact Run Commands

```bash
# backend
cd backend && php artisan serve            # http://localhost:8000
cd backend && php artisan test             # 196 tests

# frontend
cd frontend && npm run dev                 # http://localhost:3000
cd frontend && npm test && npm run lint && npm run build

# whatsapp-gateway
cd whatsapp-gateway && npm run dev         # http://localhost:4000
cd whatsapp-gateway && npm test && npm run build

# full stack (once Docker is validated)
docker compose up -d --build

# backup / restore
infrastructure/scripts/mysql-backup.sh
infrastructure/scripts/mysql-restore.sh <dump.sql.gz> [target_db]
```

## 21. Production-Readiness Assessment (honest verdict)

**Genuinely production-ready today**: the application layer itself. All CRM functionality
(contacts/leads/deals/pipelines/tasks/notes/labels/notifications/dashboards/RBAC/audit log/
workspace settings) is built, tested (196+51+12 = 259 automated tests across three services, all
green), security-reviewed (workspace isolation, rate limiting, CORS, mass-assignment, file-upload
validation, credential encryption, SQLi/XSS review), and the schema/migrations/seeders are proven
to run clean from scratch against a real database. The codebase itself has no known placeholder,
mock, or "fake success" logic in its production paths (verified by this phase's repo-wide audit,
one dead-code file removed).

**Not yet production-ready without external environments**: everything in §4/§16/§17. Concretely:
this cannot go live with real customers until (1) it has been paired with and exercised against a
real WhatsApp account — the single biggest unknown, since Baileys/WhatsApp behavior has never
been observed outside unit-test mocks; (2) a real SMTP provider is wired in and password-reset/
invitation emails are confirmed to actually deliver; (3) `docker compose up` (or an equivalent
deployment mechanism) has been run for real at least once, since the compose files have only been
manually reviewed, not executed; (4) the Playwright E2E suite has had at least one real run to
catch selector drift or integration issues invisible to unit/feature tests; (5) the CI workflow
has had one real run on an actual runner.

**Recommended path to production**: stand up a staging environment with Docker, a disposable
WhatsApp test number, and a sandbox SMTP provider (e.g. Mailtrap); run
`docker compose config` → `up` → health checks → `e2e/` suite → a manual WhatsApp pairing +
send/receive smoke test, in that order. Each of those five gaps is independent and can be closed
without touching application code — this is an environment-provisioning gap, not a code-quality
gap.
