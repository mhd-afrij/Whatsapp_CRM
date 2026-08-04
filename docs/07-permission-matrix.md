# 07 — Permission Matrix

Permissions are stored in the `permissions` table and granted to `roles` via `permission_role`.
Roles are editable (Super Admin can create custom roles), but the platform seeds 5 system roles
(`is_system = true`) with the defaults below. **Authorization checks in code always test a
permission string (e.g. `can('contacts.edit')`), never a role name** — this table documents the
seeded defaults, not a hard-coded rule.

Legend: **Y** = granted, **N** = not granted, **Own** = scoped to records the user owns/created,
**Team** = scoped to the user's team(s).

| Permission | Super Admin | Admin | Manager | Agent | Viewer |
|---|---|---|---|---|---|
| **Contacts** | | | | | |
| contacts.view | Y | Y | Y | Y | Y |
| contacts.create | Y | Y | Y | Y | N |
| contacts.edit | Y | Y | Y | Own | N |
| contacts.delete | Y | Y | N | N | N |
| contacts.export | Y | Y | Y | N | N |
| **Conversations / Inbox** | | | | | |
| conversations.view | Y | Y | Y | Team | Y |
| conversations.reply | Y | Y | Y | Y | N |
| conversations.assign | Y | Y | Y | N | N |
| conversations.close | Y | Y | Y | Own | N |
| conversations.reopen | Y | Y | Y | N | N |
| conversations.delete | Y | N | N | N | N |
| **Leads / Deals / Pipelines** | | | | | |
| leads.manage | Y | Y | Y | Own | N |
| deals.manage | Y | Y | Y | Own | N |
| pipelines.manage | Y | Y | N | N | N |
| reports.view | Y | Y | Y | Own | Y |
| **Tasks** | | | | | |
| tasks.manage | Y | Y | Y | Own | N |
| tasks.view_team | Y | Y | Team | Team | N |
| **Notes** | | | | | |
| notes.create | Y | Y | Y | Y | N |
| notes.view_private | Y | Y | Team | N | N |
| notes.manage_any | Y | Y | N | N | N |
| **Labels** | | | | | |
| labels.manage | Y | Y | Y | N | N |
| **Users / Teams / Roles (Admin)** | | | | | |
| users.view | Y | Y | Team | N | N |
| users.manage | Y | Y | N | N | N |
| roles.view | Y | Y | N | N | N |
| roles.manage | Y | N | N | N | N |
| teams.view | Y | Y | Team | N | N |
| teams.manage | Y | Y | N | N | N |
| invitations.manage | Y | Y | N | N | N |
| **Workspace / WhatsApp** | | | | | |
| workspace.settings.manage | Y | Y | N | N | N |
| whatsapp.connection.manage | Y | Y | N | N | N |
| **Notifications** | | | | | |
| notifications.manage_own | Y | Y | Y | Y | Y |
| **Audit** | | | | | |
| audit_logs.view | Y | Y | N | N | N |
| **Search / Filters** | | | | | |
| search.global | Y | Y | Y | Y | Y |
| saved_filters.manage_own | Y | Y | Y | Y | Y |
| saved_filters.share | Y | Y | Y | N | N |
| **Dashboard** | | | | | |
| dashboard.view_workspace | Y | Y | Y | N | Y |
| dashboard.view_own | Y | Y | Y | Y | Y |

## Role Summaries

- **Super Admin** — full unrestricted access, including role/permission management itself and
  irreversible actions (delete conversations, delete pipelines). Exactly one workspace-level
  super admin is expected but not enforced at the DB level (business rule, enforced in app
  logic: cannot demote the last remaining Super Admin).
- **Admin** — operational control over the whole workspace (users, teams, WhatsApp connection,
  workspace settings) but cannot edit roles/permissions or hard-delete conversations.
- **Manager** — full visibility and management within their team(s): can assign conversations,
  manage pipelines' leads/deals across the team, view team-scoped private notes, view team
  users, but has no workspace-admin or role-admin capability.
- **Agent** — day-to-day operator: replies to assigned/team conversations, manages their own
  contacts/leads/deals/tasks, creates notes, but cannot assign conversations to others or see
  other agents' private notes.
- **Viewer** — read-only across contacts, conversations, dashboards, and reports; cannot create,
  edit, reply, or manage anything. Intended for stakeholders who need visibility only.

## Enforcement Points

1. **Route middleware** (`permission:{name}`) on every `/api/v1` route per `05-api-contract.md`.
2. **Policies** for record-level "Own"/"Team" scoping (e.g. `ContactPolicy::update` checks
   `contacts.edit` OR (`contacts.edit.own` implied by ownership) — implemented as a single
   permission plus a policy-level ownership check, not two separate permission strings, to keep
   the permission catalog from exploding.
3. **Frontend** hides/disables UI per §4 of `06-frontend-route-map.md`, strictly a UX layer.
4. **Audit log** records every permission-gated mutation (`users.manage`, `roles.manage`,
   `workspace.settings.manage`, `whatsapp.connection.manage`, deletes) regardless of role.
