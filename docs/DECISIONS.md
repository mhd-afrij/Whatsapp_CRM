# DECISIONS — Assumptions & Rationale Log

This log records explicit assumptions made while producing this documentation set, since the
original spec left several implementation choices open. Each entry states the decision and why,
so a future contributor can revisit deliberately rather than by accident.

## D1 — Single workspace per deployment
**Decision**: The system is architected as one `workspaces` row per deployed instance, even
though the schema models `workspace_id` everywhere as if multi-tenant.
**Why**: The spec explicitly states "single workspace per deployment, single linked WhatsApp
number." Modeling `workspace_id` explicitly (rather than assuming a single implicit tenant)
keeps every query/permission check honest and leaves a documented path to multi-tenancy later
without a schema rewrite — but no UI/API for switching workspaces is built now.

## D2 — Single linked WhatsApp number
**Decision**: `whatsapp_sessions` has a UNIQUE constraint on `workspace_id`, i.e. exactly one
session row (hence one linked number) per workspace.
**Why**: Matches spec directly. Simplifies the entire gateway connection lifecycle (one Baileys
socket process per deployment) instead of a multiplexed multi-session manager.

## D3 — Shared MySQL database, service-owned table boundary, no cross-service DB writes
**Decision**: Backend and gateway connect to the **same** MySQL database and schema. Table
ownership is split explicitly (see `DATA_OWNERSHIP.md`): each service runs its own migrations
for the tables it owns and only ever writes to those tables. The other service gets read-only
Eloquent models (backend side) or read-only queries (gateway side, for the handful of
backend-owned columns it might need to read, e.g. workspace settings).
**Why (rejected alternatives)**:
- *Fully separate databases + only-HTTP integration*: cleaner isolation, but the inbox is
  fundamentally a join between WhatsApp-origin data (messages) and CRM data (contact
  enrichment, assignment) — forcing every inbox list query through cross-service HTTP calls
  would add latency and N+1-call complexity to the single highest-traffic read path in the
  product.
- *Gateway writes directly into backend-owned tables (e.g. sets `conversations.assigned_user_id`)*:
  rejected — would let a Node process bypass Laravel's authorization/audit-log layer for a
  CRM-domain mutation.
- **Chosen**: shared DB for fast reads/joins, strict per-column write ownership even *within* a
  shared table like `conversations` (gateway writes WhatsApp-derived columns, backend writes
  CRM-derived columns), and all cross-service *actions* (as opposed to reads) go through the
  internal HTTP API with a shared secret. This gets read performance without giving up
  authorization/audit boundaries for writes.

## D4 — Internal API authentication: shared secret header, not mutual TLS or OAuth
**Decision**: `/internal/*` endpoints on both services check a static `X-Internal-Secret` header
against an env-configured value.
**Why**: Both services run inside the same trusted Docker network, not exposed publicly. A
shared secret is sufficient defense-in-depth against accidental external exposure (e.g. a
misconfigured Nginx rule) without the operational overhead of mTLS or a full OAuth
client-credentials flow for two internal processes. Documented as revisit-worthy if the
deployment topology ever spans untrusted networks.

## D5 — Backend auth: Laravel Sanctum (session/token), not a separate JWT service
**Decision**: Sanctum, using SPA cookie-session auth for the Next.js frontend (same-site,
first-party) with the option of personal access tokens for any future non-browser client.
**Why**: Frontend and backend are deployed behind the same Nginx/domain, so Sanctum's SPA mode
(CSRF-protected, httpOnly cookies) avoids storing bearer tokens in browser JS — better XSS
posture than a hand-rolled JWT scheme, and it's the Laravel-idiomatic choice for a first-party
SPA.

## D6 — Realtime transport: gateway hosts the only Socket.IO server; backend publishes over Redis
**Decision**: See `03-system-architecture.md` §4. Only one long-lived Socket.IO server process
exists (in `whatsapp-gateway`); Laravel publishes CRM-domain events to Redis pub/sub, and a
bridge in the gateway re-emits them on a `/crm` namespace.
**Why (rejected alternative)**: Running Laravel Reverb (or Soketi) as a fourth long-running
service was considered, since it's the "native" Laravel broadcasting story. Rejected for v1 to
minimize operational surface area (one fewer stateful process to deploy/scale/monitor) given
that Node/Socket.IO already has to exist for WhatsApp events. Revisit if CRM-realtime volume
ever needs to scale independently of the WhatsApp gateway process.

## D7 — Permission model: explicit `permissions` catalog + `role_user`/`permission_role` pivots
**Decision**: Permissions are rows in a table (not enum/config-only), and role→permission
assignment is data, not code, so Super Admins can build custom roles from the existing
permission catalog.
**Why**: Spec requires "permission-based, not role-name based" authorization and a Role Admin
screen implies runtime-editable role→permission mappings — a static config-file approach
couldn't support that UI.

## D8 — Media & file storage: MinIO (S3 API) from day one, even in dev
**Decision**: `docker-compose.dev.yml` includes MinIO rather than local filesystem storage for
message media/avatars/logos.
**Why**: Keeps dev/staging/prod storage code paths identical (same S3 client, same signed-URL
generation), avoiding a class of "works locally, breaks in prod" storage bugs.

## D9 — MySQL 8+ chosen over PostgreSQL
**Decision**: MySQL 8, per the explicit spec requirement ("MySQL 8+" listed for both backend and
gateway). JSON columns used for flexible fields (`custom_fields`, `metadata`, `filter_json`)
using MySQL 8's native JSON type.
**Why**: Given directly by spec; also both Laravel and Node/Knex-family tooling have first-class
MySQL support.

## D10 — WhatsApp session credentials persisted to MySQL, not filesystem
**Decision**: `whatsapp_session_credentials` stores Baileys' multi-device auth-state key/value
pairs (encrypted at rest) in MySQL rather than the default filesystem-based auth-state store
Baileys examples typically use.
**Why**: Makes the gateway container stateless/restart-safe and consistent with the "session
persisted across gateway restarts" requirement without relying on a Docker volume surviving
container replacement; also makes credential backup ride along with the standard MySQL backup
strategy instead of needing a separate file-backup path.

## D11 — Message dedup key
**Decision**: `UNIQUE(workspace_id, whatsapp_message_id)` on `messages`, exactly as mandated by
spec; `workspace_id` included even though it's currently always the same value, for forward
compatibility and to make the constraint self-documenting.

## D12 — Soft deletes applied selectively
**Decision**: Soft deletes (`deleted_at`) on `users`, `contacts`, `leads`, `deals`, `tasks` —
records with audit/history value where "undo" and historical reporting matter. Append-only
event/log tables (`audit_logs`, `message_status_events`, `whatsapp_connection_events`,
`deal_stage_history`) are never deleted at all (no `deleted_at`, no delete endpoint). Pivot and
purely operational tables (`message_dispatch_queue`, `jobs`) use hard deletes since they're
transient by nature.

## D13 — API versioning via URL prefix (`/api/v1`)
**Decision**: Simple URL-prefixed versioning rather than header-based versioning.
**Why**: Simplest to reason about for a single first-party frontend consumer; spec explicitly
names `/api/v1`.

## D14 — 2026-08-03: Gap-fill against the "recreate WhatsApp Shared Inbox" spec, not a rewrite
**Context**: A follow-up spec requested implementing the WhatsApp Shared Inbox/Chat module as a
"complete production-ready vertical slice," structured as `apps/whatsapp-sync` +
`apps/web/src/features/inbox`, referencing a `CLAUDE.md` that does not exist in this repo.
**Finding**: Neither the `apps/*` monorepo layout nor `CLAUDE.md` exist here — the actual
structure is `backend/` (Laravel) + `frontend/` (Next.js) + `whatsapp-gateway/` (Node/Baileys),
already implementing the large majority of that spec (workspace-scoped queries, dedup on
`UNIQUE(workspace_id, whatsapp_message_id)`, cursor-paginated message history, Socket.IO
realtime, RBAC permissions, audit logging with before/after diffs, a live-tested WhatsApp
connection). Presented this conflict to the user before writing any code, per the spec's own
"inspect first, plan before editing" instruction.
**Decision**: Treat the spec as a feature/requirements checklist against the *existing* repo
structure rather than a literal directory scaffold to recreate. Implement only the genuine gaps
found on inspection, incrementally, on top of the current tested codebase:
- No `priority` field on `conversations` (only exists on `tasks`)
- Tags modeled as `labels`/`labelables`, not `tags`/`taggables` — functionally equivalent,
  kept as-is rather than introducing a second, redundant tagging system
- No standardized realtime event envelope (`event_id`/`event_type`/`workspace_id`/`occurred_at`)
  with client-side dedup by `event_id` — current Socket.IO payloads are ad-hoc per event type
- No virtualization (`react-window`/`react-virtual`) on the conversation list or message
  timeline — acceptable at current/expected data volumes, revisit if a workspace's conversation
  count or message history grows large enough to make plain `.map()` rendering visibly slow
- No dead-letter queue handling in the gateway's BullMQ outbound/media queues
- No saved-replies / message-template picker in the composer
- No per-conversation composer draft persistence
- No `conversation_assignments` history table — assignment changes are audit-logged (before/after)
  but not queryable as a dedicated timeline
- No typing indicators / agent presence
- No message full-text search

**Update â€” 2026-08-03 (inbox vertical-slice follow-up)**: The listed priority, envelope,
dead-letter, and draft items were subsequently implemented. The remaining confirmed gap was
row-level conversation enforcement: route-level permission checks and the workspace scope existed,
but inbox list and nested conversation endpoints did not uniformly apply the assignee/team policy.
`conversations.view_all` is now granted only to Super Administrator and Administrator; all other
users are limited to conversations assigned directly to them or one of their teams. This remains
an explicit policy check on detail/mutation routes as well as a query scope on the list endpoint.
**Why (rejected alternative)**: A literal rewrite into `apps/*` would re-implement already-working,
today-live-tested functionality (a real WhatsApp session was connected and exchanged messages
earlier this session) purely to match a directory name, at high risk of regressing a working
integration for no functional gain. The user confirmed this trade-off explicitly and chose the
gap-fill approach.
