# backend/api Audit Archive

Date: 2026-08-24

`backend/api/` appears to be legacy duplicate code, not an active service.

Compared areas:

- Routes: both apps expose versioned API routes, but active runtime points to `backend/routes/api.php`.
- Models: both apps define overlapping CRM models such as User, Contact, Conversation, Message, Role, Permission, and Workspace.
- Migrations: both apps include independent schema histories. The active schema used by tests and docs is under `backend/database/migrations`.
- Controllers and services: both apps include overlapping CRM/auth/report/controller code. Active controllers are under `backend/app/Http/Controllers/Api/V1`.
- Configuration: both apps have independent Laravel config and composer manifests. Compose builds only `./backend`.

Decision:

Keep `backend/api/` as deprecated source history for now, but exclude it from active maintenance. Removing it should be a separate cleanup commit after a full CI run and repository backup.
