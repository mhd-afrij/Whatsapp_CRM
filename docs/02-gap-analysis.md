# 02 — Gap Analysis

## Current Repository State

The repository `D:\Royal Project\CRM-Whatsapp` is **not yet a git repo** and contains only empty
scaffold directories:

```
CRM-Whatsapp/
├── backend/              (empty)
├── frontend/              (empty)
├── whatsapp-gateway/      (empty)
├── infrastructure/        (empty)
├── scripts/               (empty)
├── storage/               (empty)
└── docs/                  (this documentation)
```

**Nothing has been built yet.** There is no `composer.json`, no `package.json`, no Docker
Compose file, no migrations, no source code in any of the three services. This documentation set
(Phase 0–1) exists to define the target architecture, schema, contracts, and roadmap so that
implementation (Phase 2 onward) has an unambiguous specification to build against.

Gap statement: **gap = everything**. Every item below is "needed," nothing is "exists," except
where noted.

## Per-Service Gap Table

### frontend/
| Area | Exists | Needed |
|---|---|---|
| Project scaffold (Next.js 14 App Router, TS strict) | No | Yes |
| Tailwind + shadcn/ui setup, design tokens | No | Yes |
| Auth pages (login, forgot/reset password, accept invite) | No | Yes |
| Route groups `(auth)`, `(dashboard)` | No | Yes |
| 3-panel inbox UI + Socket.IO client integration | No | Yes |
| Contacts, Leads/Deals kanban, Tasks/Calendar, Notes, Labels UI | No | Yes |
| Admin UI (users, roles, teams, workspace settings, audit log) | No | Yes |
| Dashboard/analytics (Recharts) | No | Yes |
| TanStack Query data layer + RHF/Zod forms | No | Yes |
| Global search UI | No | Yes |
| WhatsApp connection/QR linking screen | No | Yes |

### backend/
| Area | Exists | Needed |
|---|---|---|
| Laravel 12 project scaffold | No | Yes |
| MySQL migrations for all CRM-owned tables | No | Yes |
| Read-only Eloquent models for gateway-owned tables | No | Yes |
| Auth (Sanctum), RBAC (roles/permissions/policies/gates/middleware) | No | Yes |
| REST API `/api/v1` controllers + Form Requests + API Resources | No | Yes |
| Events/Listeners, Notifications, Queued Jobs | No | Yes |
| Internal API for gateway → backend calls (shared secret) | No | Yes |
| Seeders (roles/permissions, demo data) | No | Yes |
| Audit logging | No | Yes |
| Tests (PHPUnit/Pest) | No | Yes |

### whatsapp-gateway/
| Area | Exists | Needed |
|---|---|---|
| Node + TS + Express project scaffold | No | Yes |
| Zod-validated env config | No | Yes |
| Baileys integration, multi-file auth state persisted to MySQL | No | Yes |
| QR generation + connection lifecycle handling | No | Yes |
| MySQL migrations for gateway-owned tables (its own migration tool, e.g. Knex/umzug) | No | Yes |
| BullMQ queues (outbound send, media download) + workers | No | Yes |
| Socket.IO server (emits realtime events, room-based) | No | Yes |
| Redis client (queue backing + pub/sub if needed) | No | Yes |
| Pino logging | No | Yes |
| Internal HTTP endpoints for backend → gateway calls (send message, connection status) | No | Yes |
| Tests (Vitest/Jest) | No | Yes |

### infrastructure/
| Area | Exists | Needed |
|---|---|---|
| `docker-compose.dev.yml`, `docker-compose.prod.yml` | No | Yes |
| MySQL, Redis, MinIO service definitions | No | Yes |
| Nginx reverse proxy config + TLS | No | Yes |
| Health-check wiring | No | Yes |
| `.env.example` per service | No | Yes |

### scripts/ & storage/
| Area | Exists | Needed |
|---|---|---|
| Deployment/backup scripts | No | Yes (Phase ~18) |
| Local MinIO/media storage mount | No | Yes |

## Conclusion

This documentation set defines the target state. Implementation begins at Phase 2 of the
roadmap (`08-implementation-roadmap.md`), starting with database migrations and models across
both backend and gateway, since every other feature depends on the shared schema being correct
first.
