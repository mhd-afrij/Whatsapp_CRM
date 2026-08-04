# 05 — API Contract (`/api/v1`)

## 1. Response Envelope Standard

**Success**
```json
{ "success": true, "message": "OK", "data": { }, "meta": { } }
```
`meta` carries pagination (`page`, `per_page`, `total`, `last_page`) or is omitted for
single-resource responses.

**Validation failure (422)**
```json
{ "success": false, "message": "The given data was invalid.", "errors": { "email": ["The email field is required."] } }
```

**General failure (4xx/5xx)**
```json
{ "success": false, "message": "Conversation not found.", "code": "CONVERSATION_NOT_FOUND" }
```

All endpoints require `Authorization: Bearer <sanctum-token>` (or session cookie for the SPA
flow) unless marked **Public**. All authenticated endpoints additionally require the caller's
user to belong to the workspace (single-workspace deployment, enforced by middleware) and to
hold the listed permission(s) — see `07-permission-matrix.md`.

---

## 2. Auth
| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Login with email/password | Public |
| POST | `/api/v1/auth/logout` | Revoke current session/token | Authenticated |
| POST | `/api/v1/auth/forgot-password` | Send password reset email | Public |
| POST | `/api/v1/auth/reset-password` | Reset password with token | Public |
| GET | `/api/v1/auth/me` | Current user + permissions + workspace | Authenticated |
| POST | `/api/v1/auth/invitations/{token}/accept` | Accept invite, set password | Public |

## 3. Workspaces
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/workspace` | Get current workspace | Authenticated |
| PATCH | `/api/v1/workspace` | Update workspace profile | `workspace.settings.manage` |
| GET | `/api/v1/workspace/settings` | Get workspace settings | Authenticated |
| PATCH | `/api/v1/workspace/settings` | Update settings (business hours, branding, defaults) | `workspace.settings.manage` |

## 4. Users
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/users` | List users (filter/search/paginate) | `users.view` |
| POST | `/api/v1/users` | Create user directly (or use invitations) | `users.manage` |
| GET | `/api/v1/users/{id}` | User detail | `users.view` |
| PATCH | `/api/v1/users/{id}` | Update user (name, role, active) | `users.manage` |
| DELETE | `/api/v1/users/{id}` | Deactivate/soft-delete user | `users.manage` |
| PATCH | `/api/v1/users/{id}/role` | Change user's role | `users.manage` |

## 5. Roles & Permissions
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/roles` | List roles | `roles.view` |
| POST | `/api/v1/roles` | Create custom role | `roles.manage` |
| GET | `/api/v1/roles/{id}` | Role detail incl. permissions | `roles.view` |
| PATCH | `/api/v1/roles/{id}` | Update role name/permissions | `roles.manage` |
| DELETE | `/api/v1/roles/{id}` | Delete role (blocked if `is_system`) | `roles.manage` |
| GET | `/api/v1/permissions` | List full permission catalog | `roles.view` |

## 6. Teams
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/teams` | List teams | `teams.view` |
| POST | `/api/v1/teams` | Create team | `teams.manage` |
| GET | `/api/v1/teams/{id}` | Team detail incl. members | `teams.view` |
| PATCH | `/api/v1/teams/{id}` | Update team | `teams.manage` |
| DELETE | `/api/v1/teams/{id}` | Delete team | `teams.manage` |
| POST | `/api/v1/teams/{id}/members` | Add member | `teams.manage` |
| DELETE | `/api/v1/teams/{id}/members/{userId}` | Remove member | `teams.manage` |

## 7. Invitations
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/invitations` | List pending/expired invitations | `users.manage` |
| POST | `/api/v1/invitations` | Invite a user by email + role | `users.manage` |
| DELETE | `/api/v1/invitations/{id}` | Revoke invitation | `users.manage` |
| POST | `/api/v1/invitations/{id}/resend` | Resend invite email | `users.manage` |

## 8. Contacts
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/contacts` | List/search/filter contacts | `contacts.view` |
| POST | `/api/v1/contacts` | Create contact manually | `contacts.create` |
| GET | `/api/v1/contacts/{id}` | Contact detail + activity timeline | `contacts.view` |
| PATCH | `/api/v1/contacts/{id}` | Update contact fields | `contacts.edit` |
| DELETE | `/api/v1/contacts/{id}` | Soft-delete contact | `contacts.delete` |
| POST | `/api/v1/contacts/{id}/merge` | Merge with a `whatsapp_contacts` record | `contacts.edit` |
| GET | `/api/v1/contacts/{id}/activities` | Paginated activity timeline | `contacts.view` |

## 9. Conversations
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/conversations` | List conversations (filter: status, assignee, label, team) | `conversations.view` |
| GET | `/api/v1/conversations/{id}` | Conversation detail | `conversations.view` |
| PATCH | `/api/v1/conversations/{id}/assign` | Assign to user/team | `conversations.assign` |
| PATCH | `/api/v1/conversations/{id}/close` | Close conversation | `conversations.close` |
| PATCH | `/api/v1/conversations/{id}/reopen` | Reopen conversation | `conversations.close` |
| POST | `/api/v1/conversations/{id}/read` | Mark read for current user | `conversations.view` |
| POST | `/api/v1/conversations/{id}/labels` | Attach label | `labels.manage` |
| DELETE | `/api/v1/conversations/{id}/labels/{labelId}` | Detach label | `labels.manage` |

## 10. Messages
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/conversations/{id}/messages` | Paginated message history (cursor-based) | `conversations.view` |
| POST | `/api/v1/conversations/{id}/messages` | Send outbound message (text/media) — enqueues via gateway | `conversations.reply` |
| GET | `/api/v1/messages/{id}` | Single message detail incl. status events | `conversations.view` |
| POST | `/api/v1/messages/{id}/retry` | Retry a failed outbound message | `conversations.reply` |

## 11. Leads
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/leads` | List/filter leads | `leads.manage` |
| POST | `/api/v1/leads` | Create lead (manual or from conversation) | `leads.manage` |
| GET | `/api/v1/leads/{id}` | Lead detail | `leads.manage` |
| PATCH | `/api/v1/leads/{id}` | Update lead | `leads.manage` |
| DELETE | `/api/v1/leads/{id}` | Soft-delete lead | `leads.manage` |
| POST | `/api/v1/leads/{id}/convert` | Convert lead to deal | `leads.manage` |

## 12. Deals
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/deals` | List/filter deals | `deals.manage` |
| POST | `/api/v1/deals` | Create deal | `deals.manage` |
| GET | `/api/v1/deals/{id}` | Deal detail incl. stage history | `deals.manage` |
| PATCH | `/api/v1/deals/{id}` | Update deal fields | `deals.manage` |
| PATCH | `/api/v1/deals/{id}/stage` | Move to a pipeline stage (kanban drag) | `deals.manage` |
| DELETE | `/api/v1/deals/{id}` | Soft-delete deal | `deals.manage` |

## 13. Pipelines
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/pipelines` | List pipelines with stages | `pipelines.manage` |
| POST | `/api/v1/pipelines` | Create pipeline | `pipelines.manage` |
| PATCH | `/api/v1/pipelines/{id}` | Update pipeline | `pipelines.manage` |
| DELETE | `/api/v1/pipelines/{id}` | Delete pipeline | `pipelines.manage` |
| POST | `/api/v1/pipelines/{id}/stages` | Add stage | `pipelines.manage` |
| PATCH | `/api/v1/pipelines/{id}/stages/{stageId}` | Update/reorder stage | `pipelines.manage` |
| DELETE | `/api/v1/pipelines/{id}/stages/{stageId}` | Delete stage | `pipelines.manage` |

## 14. Tasks
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/tasks` | List/filter tasks (assignee, due range, status) | `tasks.manage` |
| POST | `/api/v1/tasks` | Create task | `tasks.manage` |
| GET | `/api/v1/tasks/{id}` | Task detail + comments | `tasks.manage` |
| PATCH | `/api/v1/tasks/{id}` | Update task | `tasks.manage` |
| DELETE | `/api/v1/tasks/{id}` | Soft-delete task | `tasks.manage` |
| POST | `/api/v1/tasks/{id}/comments` | Add comment | `tasks.manage` |
| PATCH | `/api/v1/tasks/{id}/complete` | Mark done | `tasks.manage` |

## 15. Notes
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/notes` | List notes (filter by conversation/contact/deal) | `notes.view` |
| POST | `/api/v1/notes` | Create internal note (supports `is_private`, mentions) | `notes.create` |
| PATCH | `/api/v1/notes/{id}` | Edit own note | `notes.create` |
| DELETE | `/api/v1/notes/{id}` | Delete own note (or `notes.manage_any`) | `notes.create` |

## 16. Labels
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/labels` | List workspace labels | Authenticated |
| POST | `/api/v1/labels` | Create label | `labels.manage` |
| PATCH | `/api/v1/labels/{id}` | Update label | `labels.manage` |
| DELETE | `/api/v1/labels/{id}` | Delete label | `labels.manage` |

## 17. Notifications
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/notifications` | List current user's notifications | Authenticated |
| PATCH | `/api/v1/notifications/{id}/read` | Mark one read | Authenticated |
| POST | `/api/v1/notifications/read-all` | Mark all read | Authenticated |
| GET | `/api/v1/notifications/preferences` | Get preferences | Authenticated |
| PATCH | `/api/v1/notifications/preferences` | Update preferences | Authenticated |

## 18. Search
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/search?q=` | Global search across contacts/conversations/leads/deals | Authenticated |
| GET | `/api/v1/saved-filters` | List saved filters for current user | Authenticated |
| POST | `/api/v1/saved-filters` | Save a filter | Authenticated |
| DELETE | `/api/v1/saved-filters/{id}` | Delete a saved filter | Authenticated |

## 19. Dashboard
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/dashboard/summary` | KPI tiles (open conversations, avg response time, etc.) | `reports.view` |
| GET | `/api/v1/dashboard/conversations-volume` | Time-series for charts | `reports.view` |
| GET | `/api/v1/dashboard/pipeline-conversion` | Funnel data | `reports.view` |
| GET | `/api/v1/dashboard/agent-performance` | Per-agent workload/response metrics | `reports.view` |

## 20. Audit Logs
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/audit-logs` | List/filter audit log entries | `audit_logs.view` |
| GET | `/api/v1/audit-logs/{id}` | Single entry detail | `audit_logs.view` |

## 21. WhatsApp Connection (backend proxies to gateway's internal API)
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/whatsapp/connection` | Current session status (connected/qr_pending/etc.) | `whatsapp.connection.manage` |
| POST | `/api/v1/whatsapp/connection/start` | Start session / request new QR | `whatsapp.connection.manage` |
| GET | `/api/v1/whatsapp/connection/qr` | Get current QR payload (poll or via socket) | `whatsapp.connection.manage` |
| POST | `/api/v1/whatsapp/connection/logout` | Log out / unlink number | `whatsapp.connection.manage` |
| GET | `/api/v1/whatsapp/connection/events` | Recent connection event log | `whatsapp.connection.manage` |

---

## 22. Internal Service-to-Service API (not under `/api/v1`, shared-secret header `X-Internal-Secret`)

| Method | Path | Direction | Purpose |
|---|---|---|---|
| POST | `/internal/gateway/send-message` | backend → gateway | Enqueue an outbound WhatsApp send |
| GET | `/internal/gateway/connection-status` | backend → gateway | Poll current session status |
| POST | `/internal/gateway/session/start` | backend → gateway | Trigger QR/session (re)start |
| POST | `/internal/gateway/session/logout` | backend → gateway | Unlink current session |
| POST | `/internal/backend/contacts/sync` | gateway → backend | Notify backend a new `whatsapp_contacts` row was created/updated (optional hook; also achievable via direct DB read) |
| POST | `/internal/backend/events/broadcast` | backend → gateway | Publish a CRM realtime event to be relayed on the gateway's Socket.IO `crm` namespace |
