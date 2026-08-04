# E2E test suite (Phase 18)

**Status: written but not executed in this environment.**

This suite was authored against the real routes/selectors in `frontend/src` and the real
`/api/v1` shape in `backend/routes/api.php`, but it has never been run — there is no
Playwright browser install and no live `docker-compose` stack (backend + gateway + frontend +
MySQL + Redis all up together) available in this sandbox. Running it for the first time will
almost certainly surface selector/timing drift versus the actual rendered UI; treat first-run
failures as "test needs adjusting to match the real app," not necessarily as app bugs, until
someone has watched it run once against a live stack.

## Prerequisites to actually run this

```bash
cd e2e
npm install
npx playwright install --with-deps chromium
```

Bring up the full stack (see `docker-compose.yml` at the repo root) with a seeded test
workspace (Super Administrator / Administrator / Manager / Agent / Viewer users, per
`backend/database/seeders/RolePermissionSeeder.php`), then set the env vars in
`playwright.config.ts` (`E2E_BASE_URL`, seeded test user credentials) and run:

```bash
npx playwright test
```

## WhatsApp QR / message flows

The gateway never talks to real WhatsApp in automated tests (`whatsapp-gateway`'s own test
suite mocks Baileys entirely). `tests/whatsapp.spec.ts` assumes a **test adapter** — a stub
that implements the subset of Baileys' socket events needed to simulate qr_pending ->
connected and inbound/outbound message + delivery-ack events — per `docs/09-testing-strategy.md`
§5's "headless WhatsApp simulator." That adapter does not exist yet; building it is called out
as a Phase 19+ prerequisite for this file to be runnable, not something this pass added.

## Coverage map (23 flows from the original spec)

| # | Flow | File |
|---|---|---|
| 1 | Login | `tests/auth.spec.ts` |
| 2 | Password reset | `tests/auth.spec.ts` |
| 3 | Invitation (admin invites, invitee accepts) | `tests/auth.spec.ts` |
| 4 | Role restriction (Agent blocked from admin-only page) | `tests/auth.spec.ts` |
| 5 | Cross-workspace rejection | `tests/auth.spec.ts` |
| 6 | WhatsApp QR connection (test adapter) | `tests/whatsapp.spec.ts` |
| 7 | Incoming message | `tests/whatsapp.spec.ts` |
| 8 | Outgoing message | `tests/whatsapp.spec.ts` |
| 9 | Delivery ack | `tests/whatsapp.spec.ts` |
| 10 | Conversation assignment | `tests/inbox.spec.ts` |
| 11 | Internal note | `tests/inbox.spec.ts` |
| 12 | Contact update | `tests/inbox.spec.ts` |
| 13 | Search | `tests/inbox.spec.ts` |
| 14 | Convert to lead | `tests/crm.spec.ts` |
| 15 | Create deal | `tests/crm.spec.ts` |
| 16 | Move pipeline stage (drag) | `tests/crm.spec.ts` |
| 17 | Mark deal won | `tests/crm.spec.ts` |
| 18 | Create task | `tests/tasks.spec.ts` |
| 19 | Task reminder | `tests/tasks.spec.ts` |
| 20 | Dashboard filter | `tests/admin.spec.ts` |
| 21 | Export report | `tests/admin.spec.ts` |
| 22 | Audit log review | `tests/admin.spec.ts` |
| 23 | Suspend user | `tests/admin.spec.ts` |
