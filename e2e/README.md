# E2E Test Suite

Playwright-based end-to-end tests for the WhatsApp CRM application.

## Prerequisites

```bash
cd e2e
npm install
npx playwright install chromium
```

## Running the tests

Bring up the full stack (see `docker-compose.yml` at the repo root) with a
seeded test workspace (Super Administrator / Administrator / Manager /
Agent / Viewer users, per `backend/database/seeders/RolePermissionSeeder.php`).

Then run:

```bash
cd e2e
npx playwright test
```

Or with a custom base URL:

```bash
E2E_BASE_URL=http://localhost:3000 npx playwright test
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3000` | Frontend URL |
| `E2E_SEEDED_RESET_TOKEN` | `test-reset-token` | Password reset token (from test mailbox) |
| `E2E_SEEDED_INVITE_TOKEN` | `test-invite-token` | Invitation accept token |
| `E2E_FOREIGN_WORKSPACE_CONTACT_ID` | `999999` | Contact ID from a different workspace |

## Test Files

| File | Coverage |
|---|---|
| `auth.spec.ts` | Login, password reset, invitation, role restriction, cross-workspace |
| `inbox.spec.ts` | Conversation list, message sending, internal notes, contact update |
| `crm.spec.ts` | Contact creation, leads, pipeline, deal creation |
| `tasks.spec.ts` | Task list, task creation, priority/status filters |
| `admin.spec.ts` | Dashboard, report export, audit log, user suspension |
| `whatsapp.spec.ts` | WhatsApp connection, QR code, message lifecycle |

## Test Fixtures

`fixtures.ts` provides:
- `TEST_USERS` — seeded test credentials for each role
- `loginAs(page, user)` — logs in via the real `/login` page
- `waitForToast(page, pattern)` — waits for a toast notification

## Notes

- Tests are designed against the real Next.js App Router UI and use
  accessible selectors (roles, labels, placeholders) where possible.
- WhatsApp message flow tests (QR scan, inbound messages, delivery acks)
  require a test adapter that simulates Baileys socket events. This adapter
  is described in `docs/09-testing-strategy.md §5` and is a Phase 19+ prerequisite.
- First-run failures against a live stack should be treated as selector
  drift, not necessarily app bugs, until someone has watched the tests run.
