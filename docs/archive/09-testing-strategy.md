# 09 — Testing Strategy

## 1. Guiding Principles
- Every module lands with tests in the same phase it's built (see `08-implementation-roadmap.md`),
  not deferred to a "testing phase" for new work — Phase 17 is a hardening/coverage-gap pass,
  not the first time tests are written.
  test-covered database interactions rather than mocking Eloquent/Prisma-equivalent layers.
- Realtime and queue-based flows (message pipeline, notifications) are tested with real Redis/
  MySQL test containers, not fully mocked, because their correctness is largely about
  integration boundaries.

## 2. backend (Laravel 12)

| Layer | Tool | Scope |
|---|---|---|
| Unit | Pest (or PHPUnit) | Policies, permission resolution, value objects, form request rule sets |
| Feature | Pest + Laravel's HTTP testing | Every `/api/v1` endpoint: success envelope shape, validation-failure envelope, permission-denied cases per role, pagination `meta` |
| Integration | Pest + `RefreshDatabase` on a MySQL test DB (not sqlite, to catch MySQL-specific behavior e.g. JSON columns, enum constraints) | Cross-table flows: lead→deal conversion, conversation assignment + audit log side effects, notification dispatch on note mention |
| Queue/Jobs | Pest with `Queue::fake()` for unit tests, real queue worker run in CI job for one end-to-end smoke test | Notification jobs, reminder jobs |

Key test suites to seed early:
- `AuthTest` — login, logout, invitation accept, password reset.
- `PermissionMatrixTest` — parametrized test iterating the 5 seeded roles × every permission in
  `07-permission-matrix.md`, asserting 200 vs 403 on a representative endpoint per permission.
- `MessageDedupTest` — asserts `UNIQUE(workspace_id, whatsapp_message_id)` is enforced and that
  the API layer returns a clean conflict rather than a raw DB error.
- `ConversationAssignmentTest`, `DealStageTransitionTest`, `AuditLogWriteThroughTest`.

CI: `php artisan test --parallel` against a MySQL service container; static analysis via
Larastan/PHPStan and Pint formatting check as separate CI jobs.

## 3. whatsapp-gateway (Node/TS)

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Zod env schema validation, message normalization functions, backoff calculator |
| Integration | Vitest + `mysql2` against a test MySQL DB, `ioredis-mock` or real Redis test container, BullMQ test mode | Inbound pipeline (fake Baileys event → DB rows written → dedup respected), outbound pipeline (API call → job enqueued → job processed → status events written) |
| Contract | Vitest + supertest | Internal HTTP API (`/internal/gateway/*`) request/response shape, shared-secret auth rejection |
| Baileys interaction | Mocked Baileys socket (dependency-injected interface, never hit real WhatsApp in CI) | Connection lifecycle state machine: qr_pending → connected → disconnected → reconnecting, credential persistence round-trip |

CI: `vitest run --coverage`; ESLint + `tsc --noEmit` as separate jobs.

## 4. frontend (Next.js)

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest + React Testing Library | Zod schemas, hooks (`useConversations`, `usePermissions`), pure utils |
| Component | Vitest + RTL | Inbox panels, kanban board, forms — render + interaction, mocked TanStack Query client |
| Integration | Vitest + RTL + MSW (mock service worker) | Full page flows against a mocked `/api/v1`, including error-envelope handling and 403 UX |
| E2E | Playwright | Critical user journeys against a real running dev stack (docker-compose test profile): login → view inbox → reply to a conversation → see optimistic + confirmed message; create lead → convert to deal → drag across kanban; admin invites user → user accepts → logs in; WhatsApp QR linking happy path against a mocked gateway |

CI: `vitest run`, `playwright test` (headless, against `docker-compose.dev.yml`-equivalent CI
profile), `tsc --noEmit`, ESLint.

## 5. Cross-Service / System Tests

- A dedicated `tests/e2e` (or `tests/system`) suite, run via Playwright or a lightweight Node
  script, that boots all three services via `docker-compose.dev.yml` + a headless WhatsApp
  simulator (a stub server implementing the subset of Baileys' socket events needed for CI,
  since real WhatsApp cannot be used in automated tests) and asserts the full incoming/outgoing
  message lifecycle diagrams in `11-key-flows.md` actually occur end-to-end.
- Contract tests between backend and gateway: a shared OpenAPI/Zod schema (or generated types)
  for the `/internal/*` API so both sides fail fast on drift.

## 6. CI Pipeline Shape

```mermaid
graph LR
    A[Push / PR] --> B[Lint + Typecheck x3 services]
    B --> C[Unit tests x3 services]
    C --> D[Integration tests\n(MySQL + Redis containers)]
    D --> E[Frontend E2E - Playwright]
    D --> F[System E2E - full docker-compose + WA simulator]
    E --> G[Build artifacts / Docker images]
    F --> G
    G --> H[Deploy to staging on main merge]
```

## 7. Non-Functional Testing
- Load test the outbound message pipeline (BullMQ throughput) and the inbox list query under
  representative conversation volume before Phase 19 launch.
- Basic security testing: RBAC boundary tests (already in Phase 3/17), internal API secret
  enforcement, SQL injection/XSS spot checks on free-text fields (notes, task descriptions).
