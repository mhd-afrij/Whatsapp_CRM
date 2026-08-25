# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — WhatsApp Campaigns module

### Added
- Campaigns module (backend, root `backend/`):
  - `campaigns` + `campaign_messages` tables with per-recipient tracking.
  - `CampaignController` with CRUD, audience preview (`POST /campaigns/preview-audience`),
    send/cancel lifecycle, analytics (`GET /campaigns/{id}/analytics`) and paginated recipient
    list (`GET /campaigns/{id}/messages`), all behind `campaigns.*` permission middleware and
    `CampaignPolicy`.
  - Audience segmentation by contact labels, status (active/inactive) and name/phone search;
    contacts without phone numbers are always excluded.
  - Send pipeline: campaign rows are materialized with per-recipient template-variable rendering
    (reuses saved-reply variables like `{{contact.first_name}}`), then dispatched as queued jobs
    that open a gateway conversation per contact (`startConversation` → `sendMessage`, idempotent
    per row via deterministic idempotency keys). Row failures don't abort the campaign; counters
    finalize automatically when the last job settles.
  - Scheduling: `scheduled_at` on create/update + `campaigns:dispatch-scheduled` command wired
    into the scheduler every minute; stale stuck `sending` campaigns auto-finalize.
  - Permissions `campaigns.{view,create,update,delete,send}` seeded to Super Admin/Admin
    (+ view for Manager); also fixed phantom permissions previously enforced but never seeded:
    `templates.use`, `templates.manage`, `dlq.manage`.
  - Docker image now runs queue worker + scheduler alongside `artisan serve`
    (`docker/start.sh`), required for queued campaign sends and scheduled dispatch.
  - Feature tests: 13 passing covering authorization, validation, preview, send flow (gateway
    mocked), scheduling, cancel, resend-skips-sent, analytics and tenant isolation.
- Campaigns module (frontend):
  - `/campaigns` list page with search/status filters, inline send/cancel/delete actions.
  - `/campaigns/new` three-step wizard (Audience → Message → Review) with live audience count
    preview, saved-reply pre-fill, template variable hints and draft-vs-schedule choice.
  - `/campaigns/[id]` detail page with stat cards (targets/sent/failed/pending), message &
    audience summary, filterable/searchable recipients list, and auto-polling while sending.
  - Sidebar entry "Campaigns" gated on `campaigns.view`; API client (`campaigns-api.ts`) and
    React Query hooks (`use-campaigns.ts`).

### Fixed
- Missing `App\Services\AzureBlobService` referenced by workspace-settings/report-export WIP
  (implemented over Laravel Storage disks: public for assets, local for private exports).
- Missing service imports in `GenerateReportExportJob`/controllers from in-flight work.

### Known issues (pre-existing, unrelated)
- `DashboardAnalyticsTest` summary fixtures expect a `leads` key the dashboard endpoint no
  longer returns, and `WorkspaceSettingsAndAuditLogTest` expects `default_pipeline_id`
  persistence — both belong to the in-flight leads/pipeline refactor.

## [Unreleased] — Phase 0-1 scaffolding — 2026-07-31

### Added
- Full Phase 0 documentation set in `docs/`: requirements summary, gap analysis, system
  architecture (with mermaid container diagram), database design (~40 tables + ERD), API
  contract, frontend route map, permission matrix (38 permissions x 5 roles), implementation
  roadmap, testing strategy, deployment plan, key-flow sequence diagrams, decisions log,
  data-ownership split, and realtime event catalog.
- `frontend/`: Next.js 14+ App Router scaffold, TS strict, Tailwind + shadcn/ui with CRM color
  tokens, TanStack Query provider, axios API client, auth context, Socket.IO client provider,
  app shell (sidebar/topnav), login page, route-protection middleware, ESLint/Prettier. Verified
  `npm install` and `npm run build` succeed.
- `backend/`: Laravel 12 project, Sanctum installed, MySQL/Redis config wired from env,
  `/api/v1/health` endpoint, standardized `ApiResponse` trait, CORS config. Verified
  `composer install` and `php artisan test` succeed (3 passing tests).
- `whatsapp-gateway/`: Node + TS + Express scaffold, Zod env validation, Pino logging,
  `/healthz` + `/readyz`, BullMQ queue skeleton, `ConnectionManager` class structured around
  Baileys (not live-tested), graceful shutdown. Verified `npm install` and `npm run build`
  succeed.
- `docker-compose.yml` and `docker-compose.production.yml` wiring mysql, redis, minio, backend,
  frontend, whatsapp-gateway, nginx with health checks and named volumes.
- `infrastructure/nginx/nginx.conf` with websocket-upgrade support for Socket.IO.
- Root `.env.example` covering all services.
- `README.md`, `PROJECT_STATUS.md`, `CONTRIBUTING.md`.

### Notes
- No database migrations, models, or seeders yet — that is Phase 2.
- WhatsApp gateway's Baileys connection has not been tested against a live WhatsApp account.
- Repository is not yet a git repository; version control initialization is deferred to a later step.
