# WhatsApp CRM — Complete Feature Implementation Plan

## 1. Purpose

Upgrade the existing WhatsApp CRM from a messaging-enabled CRM into a complete
production-oriented WhatsApp team inbox. This document records repository inspection
findings, the gap between existing and missing functionality, architecture decisions,
and the phased rollout order. Every feature is implemented as a **complete vertical
slice** (Database → Backend → Gateway → Realtime → Frontend State → UI → UX States →
Tests) and keeps the application buildable and testable after every phase.

---

## 2. Repository Inspection Summary (Baseline)

### 2.1 Stack (verified)

| Layer | Technology |
|---|---|
| Backend | Laravel 12 / PHP 8.3 / MySQL 8 / Redis (Sanctum auth, custom RBAC on `permissions`/`roles` tables — **not** Spatie in this repo) |
| WhatsApp Gateway | Node.js / TypeScript / Express / Baileys / BullMQ / Socket.IO |
| Frontend | Next.js 16 / React / TypeScript / Tailwind / shadcn-style components / TanStack Query / Socket.IO client |
| Realtime | Single Socket.IO server in the gateway; `/gateway` namespace; event-envelope `{event_id, event_type, workspace_id, occurred_at, data}` |
| Queues | BullMQ (`send-message`, `media-download`) on gateway; Laravel queue on backend |

### 2.2 Existing implementation (verified in code — do NOT rebuild)

- **WhatsApp connection/session**: `ConnectionManager` (Baileys lifecycle, QR, reconnect
  with backoff, session-lock, restore-on-boot), AES-256-GCM encrypted credentials,
  `whatsapp_sessions`/`whatsapp_session_credentials`/`whatsapp_connection_events`.
- **Inbound pipeline**: `inbound-pipeline.ts` + `message-normalizer.ts` (text, media,
  view-once, location, contact_card), dedup via `UNIQUE(workspace_id, whatsapp_message_id)`,
  `message_processing_failures` recording, media-download BullMQ queue.
- **Outbound pipeline**: `send-message.queue.ts` (BullMQ, 4 attempts/exponential backoff,
  rate limiter, idempotency-key replay safety, media upload), `message_status_events`
  delivery/read tracking.
- **Realtime**: `socket-server.ts` with envelope + room conventions, `emitMessageCreated`,
  `emitMessageFailed`, `emitConversationEvent`, `emitNotificationCreated`,
  `emitConnectionUpdated`.
- **Shared team inbox**: 3-panel (`conversation-list-panel`, `chat-panel`,
  `contact-context-panel`), assignment, close/reopen, archive/unarchive, pin, mute, star,
  priority, labels, internal notes, media upload, reply/quote, cursor pagination.
- **CRM**: contacts/leads/deals/pipelines/tasks/calendar/labels/notes/mentions/
  notifications/global search/dashboards/analytics/audit log/RBAC.
- **Conversation state fields already present** (migration
  `2026_08_05_000001_add_inbox_state_fields_to_conversations_and_messages.php`):
  `archived_at`, `pinned_at`, `muted_until`, `starred_at` on `conversations`;
  `starred_at` on `messages`.
- **Message model already has** `is_deleted_for_everyone` (boolean) and
  `starred_at` — the delete/revoke field primarily exists but is **not** wired to the
  gateway inbound protocol handler or surfaced in the UI.
- **Assignment history**: `conversation_assignments` table + `ConversationAssignment`
  model + rows written on `assign()`. Missing a read endpoint + UI timeline.
- **`conversations.view_all`** permission exists (Super Admin/Admin only); per-agent
  scoping via `Conversation::scopeVisibleTo`.

### 2.3 Missing / incomplete (verified gaps)

| Area | Status |
|---|---|
| Saved Replies / Message Templates | **Missing** — no `message_templates` table, no API, no composer picker |
| Quick Replies / Slash Commands | **Missing** — composer has no `/` command handling |
| Typing Indicators | **Missing** — `typing.updated` documented in EVENT_CATALOG but no gateway/backend/frontend implementation |
| Agent Presence | **Missing** — `presence.updated` documented but not implemented; `user_presence` table exists but unused |
| Agent Read/Unread (CRM-side) | Partial — `conversation_participants.last_read_message_id` written on `markRead`; no per-user unread count/UI |
| Outbound Message Reactions | Partial — inbound reactions normalized as `reaction_message` (recorded, not persisted as rows); no outbound reaction send/UI |
| Assignment History read/UI | Partial — rows written; no endpoint/timeline |
| SLA / Response-Time Management | **Missing** — response-time analytics exist; no SLA config/states/timer |
| Message Delete/Revoke | Partial — `is_deleted_for_everyone` column exists; gateway `protocolMessage` handled as `unsupported`; no UI "This message was deleted" |
| Business Hours | Partial — `workspace_settings.business_hours` JSON exists; no central `BusinessHoursService` |
| Away Messages | **Missing** |
| Message Full-Text Search | Partial — `LIKE '%term%'` only; no message-body search endpoint |
| Dead-Letter Queue Management | Partial — `message_processing_failures` + BullMQ `failed` handler; no admin UI/retry API |
| Media Thumbnails | **Missing** — `sharp` explicitly skipped (Phase 6); `message_media` has no thumbnail fields |
| Connection Health Monitoring | Partial — status page exists; no health metrics card |
| Customer Context Panel | Partial — `contact-context-panel.tsx` exists but limited (no lead/deal/tasks/notes aggregation) |
| Advanced Labels | Partial — labels CRUD + attach/detach exist; no bulk labeling, category, automation rules |
| Rule-Based Automation | **Missing** |
| Broadcast / Campaigns | **Missing** |
| Scheduled Messaging | **Missing** |
| Analytics Improvements | Partial — dashboard/analytics exist; no SLA/agent/WhatsApp message metrics |
| AI / Chatbot Hooks | **Missing** — no `ConversationAssistant` interface |

---

## 3. Architecture Decisions

1. **Follow the existing 3-service architecture**; no new service. All new realtime events
   stay on the gateway's Socket.IO server using the existing envelope.
2. **Reuse the existing RBAC** (custom `permissions`/`roles` tables, `permission:x.y`
   middleware, Policies). Add new permission strings to `PermissionSeeder::catalog()` and
   `RolePermissionSeeder` matrix. Do NOT adopt Spatie (not present).
3. **Reuse existing API conventions**: `ApiResponse` trait (`{success,message,data,meta}`),
   `auth:sanctum`+`active` middleware, `permission:` route middleware, `AuditLogger::log()`,
   workspace isolation via `BelongsToWorkspace` + `WorkspaceScope`.
4. **Ephemeral realtime state lives in Redis**, not MySQL. Typing and presence are written
   to Redis with TTL heartbeats; a tiny Socket.IO fan-out relays them. No per-keystroke DB
   writes.
5. **Message/media remains gateway-owned** (`docs/DATA_OWNERSHIP.md`). The backend never
   writes `messages` directly; all mutations go through the internal HTTP API
   (`/internal/whatsapp/*`). New outbound actions (send reaction, send typing, send
   scheduled message) follow the same internal-API pattern.
6. **SLA timers are computed dynamically**, not stored per-second. `SlaService` derives
   state from `messages.sent_at`/`conversations.last_message_at` + workspace SLA config +
   business hours.
7. **Automation runs in Laravel** (it owns CRM data) triggered by events, with a
   `automation_executions` audit/log table and loop prevention (max recursion depth +
   idempotency key).
8. **Campaigns/broadcasts are asynchronous** through a dedicated BullMQ queue on the
   gateway, respecting the existing send rate limiter and idempotency. No synchronous mass
   send.
9. **AI is a hook, not autonomous** — a `ConversationAssistant` interface returning
   *suggested* replies only; a human agent must approve before send.

---

## 4. Rollout Order (Sprints)

| Sprint | Scope |
|---|---|
| **Sprint 1** | Saved Replies, Quick Replies, Typing Indicators, Agent Presence, Agent Read/Unread, Outbound Reactions |
| **Sprint 2** | Assignment History, SLA, Message Revoke, Business Hours, Away Messages |
| **Sprint 3** | Full-Text Search, DLQ Management, Media Thumbnails, Connection Health |
| **Sprint 4** | Customer Context Panel, Advanced Labels, Automation Engine |
| **Sprint 5** | Scheduled Messaging, Campaign Infrastructure, Broadcast UI, Campaign Analytics |
| **Sprint 6** | Advanced Analytics, AI Suggested Reply, Chatbot Integration Hooks |

Each sprint is independently shippable/testable. Sprint 1 is the immediate focus.

---

## 5. Database Changes (all additive, workspace-scoped)

### Sprint 1
- **`message_templates`** (new, backend-owned): `id`, `workspace_id`, `name`, `shortcut`,
  `content`, `category`, `variables` (JSON), `is_active`, `created_by`, `updated_by`,
  `created_at`, `updated_at`. Index `(workspace_id, is_active)`, `(workspace_id, category)`.
- **`message_reactions`** (existing table, gateway-owned): add `sender_user_id` for
  outbound agent reactions (currently only `whatsapp_contact_id`/`user_id` were assumed).
  Inspect existing migration before adding.
- **`conversation_participants`** (existing): ensure `last_read_message_id`/`last_read_at`
  are indexed for unread computation.

### Sprint 2
- **`sla_configs`** (new, backend-owned): `workspace_id`, `name`, `first_response_minutes`,
  `followup_response_minutes`, `priority` (nullable/JSON), `business_hours_id` (nullable),
  `is_active`, timestamps.
- **`messages`** (existing, gateway-owned): verify `is_deleted_for_everyone`,
  `deleted_at`, `deleted_by_type` columns exist; add if missing.
- **Away messages**: store in `workspace_settings` JSON (extend existing `business_hours`
  JSON) — no new table needed.

### Sprint 3
- **`message_media`** (existing, gateway-owned): add `thumbnail_storage_path`, `width`,
  `height` if missing.
- **FULLTEXT index** on `messages.body` (MySQL FULLTEXT).

### Sprint 4
- **`automation_rules`** (new, backend-owned): trigger/conditions/actions JSON, `is_active`,
  `priority`, timestamps.
- **`automation_executions`** (new, backend-owned): rule, trigger entity, `status`,
  `result`, error, timestamps.

### Sprint 5
- **`campaigns`**, **`campaign_recipients`**, **`campaign_messages`**, **`campaign_events`**
  (new, backend-owned for config + gateway-owned for message rows).
- **`scheduled_messages`** (new, backend-owned).

---

## 6. API Changes

All under `/api/v1`, `auth:sanctum`+`active`, `ApiResponse` envelope, workspace-scoped,
permission-gated, audited.

### Sprint 1
- `GET/POST /api/v1/templates`, `GET/PATCH/DELETE /api/v1/templates/{id}` (permission
  `templates.manage`; list open to any agent with `conversations.reply` to use in composer).
- `POST /api/v1/templates/{id}/preview` — resolve variables.
- `POST /api/v1/conversations/{id}/reactions` (permission `conversations.reply`) → gateway
  internal send-reaction.
- `DELETE /api/v1/conversations/{id}/reactions/{reactionId}` (remove own reaction).
- `GET /api/v1/presence` (team presence) + heartbeat endpoint.
- `POST /api/v1/conversations/{id}/typing` (agent→gateway→WhatsApp typing).
- `GET /api/v1/me/unread` — per-user unread conversations count.

### Sprint 2
- `GET /api/v1/conversations/{id}/assignment-history`.
- `GET/PUT /api/v1/sla-configs` (+ per-priority).
- `GET /api/v1/conversations/{id}/sla` — live SLA state for a conversation.
- `POST /api/v1/conversations/{id}/away` (trigger manual away) — internal.
- Business hours read/write via existing `/workspace` settings endpoint (extend payload).

### Sprint 3
- `GET /api/v1/messages/search?q=&from=&to=` (permission `conversations.view`).
- `GET /api/v1/failed-jobs` (admin, `audit_logs.view` or new `dlq.manage`).
- `POST /api/v1/failed-jobs/{id}/retry`, `POST /api/v1/failed-jobs/retry-all`,
  `DELETE /api/v1/failed-jobs/{id}`.
- `GET /api/v1/whatsapp/health` — connection-health metrics.

### Sprint 4
- `GET /api/v1/conversations/{id}/context` — aggregated customer context (contact, lead,
  deals, labels, tasks, notes, activities).
- `POST /api/v1/conversations/{id}/bulk-labels`.
- `GET/POST/PATCH/DELETE /api/v1/automation-rules` (+ `POST /{id}/test`).

### Sprint 5
- `GET/POST/PATCH/DELETE /api/v1/campaigns`, `POST /{id}/preview`,
  `POST /{id}/launch`, `POST /{id}/pause`, `POST /{id}/cancel`, `GET /{id}/analytics`.
- `POST /api/v1/conversations/{id}/schedule`, `GET/POST/DELETE /api/v1/scheduled-messages`.

### Sprint 6
- `POST /api/v1/conversations/{id}/ai-suggestion` (returns suggested reply, never sends).
- Expanded analytics endpoints (SLA compliance, per-agent message counts).

---

## 7. Gateway Changes

All new outbound actions go through internal API routes
(`whatsapp-gateway/src/routes/internal-whatsapp.routes.ts`) gated by
`requireInternalToken` + Zod-validated body:

- **Sprint 1**: `POST /internal/whatsapp/typing` (send typing via Baileys
  `sendPresenceUpdate`), `POST /internal/whatsapp/reactions` (send/react via Baileys
  reaction message, persist `message_reactions` row, emit `message.reaction.created`),
  `DELETE /internal/whatsapp/reactions/{id}` (remove reaction, emit
  `message.reaction.removed`).
- **Sprint 3**: extend `media-download.queue.ts` with `sharp` thumbnail generation
  (non-blocking; store thumbnail, keep original). Add DLQ metadata capture in
  `handleSendMessageFailure`.
- **Sprint 5**: new BullMQ `campaign-send` queue + `scheduled-message` delayed queue.
- **Sprint 6**: `ConversationAssistant` interface + provider adapter (mock/OpenAI-style)
  returning suggested replies.

---

## 8. Socket.IO Events

All use the existing envelope `{event_id, event_type, workspace_id, occurred_at, data}`
and are added to `docs/EVENT_CATALOG.md` after implementation. No duplicate event names.

| Event | Sprint | Emitted by | Rooms |
|---|---|---|---|
| `typing.updated` | 1 | gateway (relay agent/customer typing) | `workspace:{id}:conversation:{cid}` |
| `presence.updated` | 1 | gateway (Redis heartbeat bridge) | `workspace:{id}` |
| `message.reaction.created` | 1 | gateway | conversation room |
| `message.reaction.removed` | 1 | gateway | conversation room |
| `conversation.read` | 1 | gateway/backend | inbox + conversation room |
| `conversation.unread` | 1 | gateway | inbox |
| `conversation.sla.updated` | 2 | backend | inbox + conversation room |
| `conversation.sla.breached` | 2 | backend | inbox + user room |
| `message.deleted` | 2 | gateway | conversation room |
| `connection.health.updated` | 3 | gateway | workspace room |
| `automation.executed` | 4 | backend | workspace/user room |
| `campaign.updated` | 5 | backend | workspace room |

---

## 9. Permissions (new)

Added to `PermissionSeeder::catalog()` + `RolePermissionSeeder` matrix:

- `templates.manage` (Super Admin, Admin, Manager) — manage saved replies.
- `templates.use` (Super Admin, Admin, Manager, Agent) — use templates in composer.
- `sla.manage` (Super Admin, Admin) — configure SLA.
- `dlq.manage` (Super Admin, Admin) — manage failed jobs.
- `automation.manage` (Super Admin, Admin, Manager) — manage automation rules.
- `campaigns.manage` (Super Admin, Admin, Manager) — create/launch campaigns.
- `scheduled_messages.manage` (Super Admin, Admin, Manager, Agent) — schedule messages.
- `whatsapp.health.view` (Super Admin, Admin, Manager) — view connection health.

---

## 10. Frontend Changes

Reuse existing components (`ui/*`, `layout/*`, design tokens). New/changed files per sprint:

### Sprint 1
- `settings/whatsapp/templates/page.tsx` — template CRUD management.
- `components/inbox/saved-replies-picker.tsx` — composer `⚡` picker.
- `components/inbox/quick-replies.tsx` — `/` slash command popover.
- `components/inbox/typing-indicator.tsx` — "typing…" bubble (subtle, non-intrusive).
- `components/inbox/presence-avatar.tsx` + team sidebar presence.
- `components/inbox/reaction-picker.tsx` — hover reaction picker + existing
  `MessageReactions` display extended.
- Composer integration (saved replies, slash, typing send, schedule later).
- Update `chat-panel.tsx`, `conversation-list-panel.tsx`, `conversation-item.tsx`.

### Sprint 2
- SLA badge in list + header (`components/inbox/sla-badge.tsx`).
- Assignment history timeline in activity.
- "This message was deleted" rendering in `MessageBubble`.
- `settings/whatsapp/business-hours/page.tsx` + away-message editor.

### Sprint 3
- Message full-text search UI (`/search` grouped results + highlight).
- `settings/system/failed-jobs/page.tsx` admin UI.
- Media thumbnail rendering in `media-preview.tsx`.
- Connection health card in `settings/whatsapp`.

### Sprint 4
- Enhanced `contact-context-panel.tsx` (lead/deal/tasks/notes/activity aggregation).
- Advanced labels (bulk labeling, categories).
- `automation/page.tsx` rule builder.

### Sprint 5
- `campaigns/page.tsx` + stepper creation + analytics.
- Scheduled message UI in composer + conversation.

### Sprint 6
- AI suggested reply card in composer (`✨ AI Suggestion` with Insert/Regenerate/Dismiss).
- Advanced analytics dashboard.

---

## 11. Testing Strategy

Each sprint adds tests mirroring existing patterns:

- **Backend** (`php artisan test`): feature/API tests, authorization per role, workspace
  isolation, validation, audit logging.
- **Gateway** (`npx vitest run`): mocked-Baileys tests for typing/reaction/revoke/media
  queues, retry/idempotency.
- **Frontend** (`npx vitest run`): component/interaction tests for composer, saved replies,
  reaction picker, SLA badge, typing, presence.
- Required scenarios: inbound/outbound text, duplicate, failed/retry/final-failure,
  reaction add/remove, revoke, media+thumbnail, assignment history, read/unread,
  SLA start/pause/resume/breach, business-hours calc, template CRUD+variable replacement,
  automation trigger/condition/action/loop-prevention, campaign audience/schedule/rate-limit/
  failure/cancel.

---

## 12. Risks & Dependencies

- **Live WhatsApp/MySQL/Redis/Docker unverified** in this environment (see
  `FINAL_REPORT.md` §16/§17). All gateway changes are unit-tested against mocks; real
  Baileys behavior (typing/reaction presence) needs a live session to fully validate.
- **`sharp` native binary** — risky to add/verify blind on Windows/XAMPP; guard thumbnail
  generation so it never blocks the ingestion pipeline and tests mock it.
- **Data ownership** — backend must never write `messages`/`message_reactions` directly;
  route reaction/typing/revoke through the gateway internal API.
- **Idempotency** — manual DLQ retry and campaign sends must reuse the existing
  `idempotency_key` / `whatsapp_message_id` uniqueness to avoid duplicate WhatsApp sends.
- **Loop prevention** — automation → message → automation must be bounded (max depth,
  idempotency key per execution).
- **SLA timers** — computed dynamically; must respect business hours and be cheap (cached,
  indexed).

---

## 13. Definition of Done

A feature is complete only when it has: database support (if required), backend
API/service, authorization, gateway integration (if required), Socket.IO event (if
required), frontend UI, loading/empty/error states, realtime sync, tests, documentation,
migration, and audit logging — and the full suite (backend + gateway + frontend tests,
lint, TypeScript, production build, migration check) passes.

---

## 14. Immediate Next Steps (Sprint 1)

1. Backend: `message_templates` migration + model + policy + controller + routes +
   `templates.manage`/`templates.use` permissions + audit logging.
2. Gateway: `typing` + `reactions` internal routes + Baileys `sendPresenceUpdate`/reaction
   + Redis-backed presence heartbeat + Socket.IO `typing.updated`/`presence.updated`/
   `message.reaction.created`/`message.reaction.removed`.
3. Backend: presence heartbeat endpoint + per-user unread endpoint + outbound reaction
   proxy.
4. Frontend: template management page + saved-replies picker + slash commands + typing
   indicator + presence avatars + reaction picker + read/unread UI.
5. Update `docs/EVENT_CATALOG.md`, `docs/05-api-contract.md`, `docs/07-permission-matrix.md`.
6. Run full test/lint/build/migration verification for each addition.
