# DATA OWNERSHIP — Table & Column Write Boundaries

## 1. Boundary Mechanism (chosen approach)

**Shared MySQL database, service-owned migrations, guarded cross-service reads, HTTP for
cross-service actions.**

- Both `backend` (Laravel) and `whatsapp-gateway` (Node) connect to the **same** MySQL schema.
- Each service owns a disjoint set of tables and runs its **own** migration tool against them:
  - `backend` uses Laravel migrations for backend-owned tables.
  - `whatsapp-gateway` uses its own migration tool (Knex or umzug) for gateway-owned tables.
  - Neither service's migration tool ever touches a table it doesn't own.
- For tables owned by the *other* service, a service gets **read-only** access:
  - Backend defines Eloquent models for gateway-owned tables (`WhatsappSession`,
    `WhatsappContact`, `Message`, etc. read variants) with `public $timestamps` mapped correctly
    but `save()`/`create()`/`update()`/`delete()` disabled at the model layer (override the
    methods to throw, or simply never call them — enforced by code review + a lint rule that
    flags writes to these model classes). As defense in depth, the MySQL user Laravel connects
    with can be granted `SELECT`-only on gateway-owned tables in `prod`.
  - Gateway rarely needs to read backend-owned tables directly; where it does (e.g. checking
    workspace business hours before sending an auto-reply, if added later), it queries read-only
    too, same pattern mirrored.
- **Any action that mutates the other service's data goes through the internal HTTP API**
  (`/internal/*`, shared-secret authenticated — see `05-api-contract.md` §22 and
  `DECISIONS.md` D3/D4), not a direct write. Example: the backend never inserts a row into
  `messages` itself; it calls `POST /internal/gateway/send-message` and the gateway performs the
  Baileys send + DB write.
- **Split-ownership tables** (`conversations` is the one case): even though the migration is
  owned by the gateway (it creates the table since conversations originate from WhatsApp
  contact), specific *columns* are designated CRM-owned and only the backend ever writes them
  (`contact_id`, `assigned_user_id`, `assigned_team_id`, `status`, `closed_at`, `closed_by`).
  The gateway never writes those columns even though it has DB access to the table; this is
  enforced by convention + code review + integration tests (`ConversationOwnershipTest`) that
  assert each service's write path only touches its column subset.

## 2. Why this approach (vs. alternatives)

See `DECISIONS.md` D3 for the full trade-off discussion. Summary: a fully separate-database,
HTTP-only integration was rejected because the inbox's core read (conversation list joined with
CRM assignment/contact data) is the hottest path in the product and cannot afford a network hop
per row; a fully shared, unguarded database was rejected because it would let either service
silently bypass the other's authorization/audit-log layer.

## 3. Ownership Table

### Owned & migrated by `whatsapp-gateway` (Node)
| Table | Write access |
|---|---|
| whatsapp_sessions | gateway only |
| whatsapp_session_credentials | gateway only |
| whatsapp_connection_events | gateway only |
| whatsapp_sync_checkpoints | gateway only |
| whatsapp_contacts | gateway only (except `contact_id` link, see below) |
| conversations | gateway (WhatsApp-derived columns only — see §4) |
| messages | gateway only |
| message_media | gateway only |
| message_status_events | gateway only |
| message_reactions | gateway only |
| message_dispatch_queue | gateway only (created by gateway when backend calls `/internal/gateway/send-message`) |
| message_processing_failures | gateway only |

### Owned & migrated by `backend` (Laravel)
| Table | Write access |
|---|---|
| workspaces | backend only |
| workspace_settings | backend only |
| users | backend only |
| roles | backend only |
| permissions | backend only |
| role_user | backend only |
| permission_role | backend only |
| teams | backend only |
| team_user | backend only |
| invitations | backend only |
| contacts | backend only (except reverse link population from gateway merge suggestion — see §4) |
| conversations | backend (CRM-derived columns only — see §4) |
| leads | backend only |
| deals | backend only |
| pipelines | backend only |
| pipeline_stages | backend only |
| deal_stage_history | backend only |
| contact_activities | backend only |
| internal_notes | backend only |
| note_mentions | backend only |
| tasks | backend only |
| task_comments | backend only |
| task_reminders | backend only |
| labels | backend only |
| contact_label / conversation_label / lead_label / deal_label | backend only |
| notifications | backend only |
| notification_preferences | backend only |
| audit_logs | backend only |
| user_presence | backend only (updated via Socket.IO presence events relayed to a backend endpoint, or written directly by backend session heartbeat) |
| saved_filters | backend only |
| failed_jobs | backend only (Laravel queue) — gateway has its own BullMQ failure tracking in Redis/`message_processing_failures`, not this table |
| jobs | backend only (Laravel queue table) |

### Column-level split table: `conversations`
| Column | Owner | Notes |
|---|---|---|
| id, workspace_id, whatsapp_contact_id, last_message_at, last_message_preview, unread_count, created_at | gateway | set at row creation / per inbound-outbound message |
| contact_id, status, assigned_user_id, assigned_team_id, closed_at, closed_by, updated_at (on CRM changes) | backend | set via `/api/v1/conversations/*` endpoints |

### Cross-link fields
- `whatsapp_contacts.contact_id` — nullable FK toward `contacts`. Written by **backend** during
  the merge action (`POST /contacts/{id}/merge`), even though `whatsapp_contacts` is otherwise
  gateway-owned. This is the single explicitly allowed exception, scoped to exactly one column,
  documented here so it isn't mistaken for a boundary violation. It is implemented as a narrow,
  single-purpose Eloquent method (not general write access to the model).
- `contacts.whatsapp_contact_id` — the reverse pointer, backend-owned as part of a backend-owned
  table, set in the same merge transaction.

## 4. Enforcement Checklist (for reviewers)

- [ ] New migration only touches tables the authoring service owns.
- [ ] No Eloquent model for a gateway-owned table exposes `create`/`update`/`delete`/`save`
      except the explicitly documented exceptions above.
- [ ] No gateway code path writes to a backend-owned column of `conversations`.
- [ ] Any new cross-service mutation is added to `/internal/*` in `05-api-contract.md`, not
      implemented as a direct cross-schema write.
- [ ] `prod` MySQL grants reflect the boundary (SELECT-only cross-service grants) as a
      defense-in-depth backstop.
