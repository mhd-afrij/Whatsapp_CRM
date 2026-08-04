# 08 — Implementation Roadmap

This documentation set is **Phase 0–1** of an estimated ~20-phase build. Phases below are scoped
to be independently shippable/testable increments; later phases assume earlier ones are done.

## Phase 0 — Discovery & Specification (this deliverable)
Requirements summary, gap analysis, architecture, DB design, API contract, route map,
permission matrix, roadmap, testing strategy, deployment plan, decisions log, data ownership
doc, event catalog, key flow diagrams.

## Phase 1 — Environment & Tooling Scaffolding
- Initialize git repo, base `.gitignore`, `.editorconfig`.
- Scaffold `backend` (Laravel 12, PHP 8.3), `frontend` (Next.js 14 App Router + TS strict +
  Tailwind + shadcn/ui), `whatsapp-gateway` (Node 20 + TS + Express).
- `infrastructure/docker-compose.dev.yml` with MySQL, Redis, MinIO, Nginx, and the three app
  services wired for hot-reload.
- Per-service `.env.example`, lint/format configs (ESLint/Prettier, Laravel Pint), CI skeleton.

## Phase 2 — Database Foundations
- Backend: migrations for all backend-owned tables (§1 and §4 of `04-database-design.md`),
  model factories, base Eloquent models, seeders for permissions catalog + 5 system roles.
- Gateway: its own migration tool (e.g. Knex or umzug) owning gateway tables (§2 and the
  gateway-owned columns of `conversations`/`messages` in §3).
- Backend read-only Eloquent models pointed at gateway tables, with write-guards.
- Verify FK integrity and the `UNIQUE(workspace_id, whatsapp_message_id)` constraint end to end.

## Phase 3 — Auth & RBAC
- Sanctum auth (login/logout/me), password reset flow, invitation accept flow.
- Permission/Role/Policy/Gate framework; `permission:` middleware; audit log write-through on
  sensitive actions.
- Frontend: `(auth)` route group, session bootstrap, permission-aware nav shell.

## Phase 4 — WhatsApp Gateway Core
- Baileys integration: boot, QR generation, multi-device auth-state persistence to MySQL,
  connection status machine, structured Pino logging.
- Internal HTTP API (`/internal/gateway/*`) + shared-secret middleware.
- Socket.IO server with room conventions from `EVENT_CATALOG.md`.

## Phase 5 — Inbound Message Pipeline
- Baileys message events → `whatsapp_contacts` upsert → `conversations` upsert →
  `messages`/`message_media` write → `message.created` socket emit.
- Media download worker (BullMQ) writing to MinIO.
- Dedup verification against the unique constraint under simulated duplicate delivery.

## Phase 6 — Outbound Message Pipeline
- `POST /conversations/{id}/messages` → backend validates/authorizes → calls
  `/internal/gateway/send-message` → gateway enqueues on BullMQ `outbound-messages` → Baileys
  send → `message_status_events` written on delivery/read receipts → socket emits.
- Retry/backoff policy, `message_processing_failures` population, `POST /messages/{id}/retry`.

## Phase 7 — Realtime Inbox Frontend
- 3-panel inbox UI, TanStack Query wiring, Socket.IO client provider, optimistic send,
  typing indicators, read receipts, conversation assignment UI.

## Phase 8 — Contacts Module
- CRM contact CRUD, merge-with-`whatsapp_contacts` flow, activity timeline, contact search.

## Phase 9 — Leads, Deals & Pipelines
- Pipeline/stage admin, kanban board (drag-drop stage changes + `deal_stage_history`), lead →
  deal conversion flow, deal detail view.

## Phase 10 — Tasks & Calendar
- Task CRUD, comments, reminders (queued notification jobs), calendar aggregation view.

## Phase 11 — Notes & Labels
- Internal notes with @mentions (`note_mentions` → notification), private-note visibility
  enforcement, label CRUD + attach/detach across contacts/conversations/leads/deals.

## Phase 12 — Notifications
- Notification center, preferences, realtime push, email channel (queued), event catalog
  producers wired across all modules above.

## Phase 13 — Global Search & Saved Filters
- Cross-entity search endpoint (DB-backed initially; consider full-text/OpenSearch later),
  saved filters CRUD + sharing.

## Phase 14 — Dashboard & Analytics
- KPI aggregation queries/materialized views, Recharts dashboard, per-agent performance,
  pipeline conversion funnel.

## Phase 15 — Admin Suite
- User/team/role admin UI, invitations UI, workspace settings UI, WhatsApp connection
  management UI (QR linking screen, reconnect/logout), audit log viewer.

## Phase 16 — Reconnection & Resilience Hardening
- Full reconnection flow (credential reload, backoff, connection event logging), queue
  dead-letter handling, health checks on all three services.

## Phase 17 — Testing Pass
- Backend Pest/PHPUnit feature+unit coverage, gateway Vitest coverage, frontend
  component/integration tests, Playwright E2E for critical flows (login, send/receive message,
  lead-to-deal conversion, QR linking). See `09-testing-strategy.md`.

## Phase 18 — Deployment & Ops
- `docker-compose.prod.yml`, Nginx TLS config, backup scripts, migration/rollback runbook,
  zero-downtime deploy process. See `10-deployment-plan.md`.

## Phase 19 — Beta Hardening & Launch
- Load testing the message pipeline, security review (RBAC edge cases, internal API secret
  rotation), accessibility pass on frontend, documentation for end users/admins.

## Phase 20 — Post-Launch Iteration Backlog
- Multi-pipeline analytics, additional channels, export/reporting, SLA timers, canned
  responses/templates, chatbot/auto-reply hooks — explicitly deferred, tracked separately.
