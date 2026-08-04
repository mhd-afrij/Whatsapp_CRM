# Project Status

**Phase 0-20 complete.** All 20 phases of the roadmap in `docs/08-implementation-roadmap.md` are
built and independently verified in this environment: backend 196/196 tests, whatsapp-gateway
51/51 tests, frontend 12/12 tests + clean lint/build (29 routes), a clean
`migrate:fresh --seed` against real MySQL, a tested MySQL backup/restore round trip, and a
written-but-unexecuted Playwright E2E suite + GitHub Actions CI workflow (no live browser/runner
was ever available in this environment). Phase 20's final audit removed one dead-code file
(`whatsapp-gateway/src/queues/outgoing-message.queue.ts`, an unwired Phase-0 stub) and fixed two
real gitignore/secrets-hygiene gaps (frontend `.env*` would have excluded `.env.example`; a stray
`backend/.env.bak.tmp` wasn't covered by the backend gitignore's literal-filename patterns). See
**`FINAL_REPORT.md`** for the complete, itemized completion report (modules, architecture,
database, routes, API/gateway modules, realtime events, test counts, security checks, Docker
validation status, known limitations, and an honest production-readiness verdict).

Last updated: 2026-07-31.

## Phase 20 — Final Verification (this update)

Repository-wide audit, full suite re-run, and final documentation pass. Full details in
`FINAL_REPORT.md`; summary here for the phase log:

- **Dead-code audit**: grepped all of `backend/app`, `whatsapp-gateway/src`, `frontend/src` for
  TODO/FIXME/HACK/placeholder/dummy/hard-coded/console.log/dd(/dump(/var_dump/debugger/
  temporary/not-implemented. Every hit reviewed by hand. Found and removed one real dead-code
  gap: `whatsapp-gateway/src/queues/outgoing-message.queue.ts`, a Phase-0-era stub whose processor
  unconditionally threw `NotImplementedError`, whose BullMQ worker was still being started in
  production (`index.ts`) even though nothing in the codebase ever enqueued a job to it — the
  real, tested, fully-implemented outbound send path is `send-message.queue.ts` (built in a later
  phase and never used to replace the earlier stub's wiring). Removed the stub file and its three
  wiring points in `index.ts` (import, `.run()`, graceful-shutdown `.close()` calls); confirmed
  clean with `npx tsc --noEmit`, `npm run build`, and `npx vitest run` (still 51/51). All other
  grep hits were legitimate (JSX `placeholder=` props, TanStack Query's `placeholderData` option,
  logging-config `replace_placeholders` keys, an accurate "temporary access method" doc comment) —
  no other change needed.
- **Full suite re-run from clean state**: `php artisan test` → 196 passed (745 assertions,
  unchanged from Phase 18); `npx vitest run` (gateway) → 51 passed (unchanged, confirmed after the
  dead-code removal above); `npm test && npm run lint && npm run build` (frontend) → 12 passed,
  clean lint, clean build, 29 routes. No regressions found across 20 phases of incremental change.
- **`php artisan migrate:fresh --seed`** re-run against the same real local MySQL instance used
  since Phase 2/19 — all 49 migrations and 5 seeders (`WorkspaceSeeder`, `PermissionSeeder`,
  `RolePermissionSeeder`, `AdminUserSeeder`, `PipelineSeeder`) completed clean. 55 tables confirmed
  via `SHOW TABLES` afterward.
- **Permission-matrix spot-check**: picked 5 permissions (one per module area) and traced them
  from `docs/07-permission-matrix.md` to the actual enforcement point in code —
  `conversations.view` (inbox route middleware), `leads.manage`/`deals.manage` (route
  middleware), `tasks.manage`/`tasks.view_team` (`TaskPolicy`), `teams.view`/`teams.manage`
  (`TeamPolicy`) and `roles.view`/`roles.manage` (`RolePolicy`), `users.manage` (route
  middleware). All five matched the matrix exactly — no naming drift found this pass (unlike the
  Phase 4 incident referenced in the task brief, which was already corrected in an earlier
  phase).
- **Secrets/gitignore audit — two real gaps found and fixed**:
  1. `frontend/.gitignore`'s `.env*` glob would also match and exclude `.env.example`, so once
     `git init` happens the onboarding template would silently never get committed. Added
     `!.env.example`.
  2. A stray `backend/.env.bak.tmp` (containing a real local-dev `APP_KEY`) existed on disk and
     was **not** covered by `backend/.gitignore`, which only listed literal filenames (`.env`,
     `.env.backup`, `.env.production`) rather than a glob. Deleted the stray file and broadened
     the pattern to `.env.*` with explicit `!.env.example`/`!.env.testing` exceptions so any
     future `.env.<variant>` is covered by default.
  - `backend/.env` and `frontend/.env.local` (the only two env files that exist on disk;
    `whatsapp-gateway/.env` was never created) were manually inspected — every value is an
    obvious local-dev placeholder (empty DB password, `MAIL_MAILER=log`, localhost URLs, local
    MinIO endpoint). Nothing resembling a real production credential found.
- **README.md refresh**: was still describing Phase 0-1 state (`php artisan migrate # once
  migrations exist (Phase 2)`, no seed step, no gateway/frontend test commands, no backup/restore
  mention, "Phase 0-1 of ~20" status line). Rewrote the Quick Start / per-service setup sections
  to include `--seed`, the real test commands for all three services plus `e2e/`, the
  backup/restore script invocations, and an accurate "Phase 0-20 complete" status section pointing
  to `FINAL_REPORT.md`.
- **Not done this phase, deliberately** (already flagged as needing a different environment, not
  re-litigated as new findings): a live `docker compose up`, a real GitHub Actions run, and
  executing the Playwright E2E suite. See `FINAL_REPORT.md` §16/§17 for the full list of
  environment-dependent gaps and exactly what's ready to go once each environment exists.

## Phase 19 — DevOps and Deployment

Environment reality check first, since it drove what could and couldn't be verified: **Docker
is not installed in this environment at all** — no `docker` or `docker compose` CLI, no Docker
Desktop at `C:\Program Files\Docker`, no docker service. Confirmed by direct command execution
(`docker version` / `docker compose version` both → `command not found`) rather than assumed.
That means no `docker compose config`, no `docker compose up`, nothing Docker-shaped could be
run here — everything below in that category is a manual review + fix pass, not a live
verification, and is called out as such. A local MySQL (XAMPP, `C:\xampp\mysql\bin`) *was*
reachable, so the backup/restore scripts were actually exercised end-to-end.

### (a) Infrastructure review — real drift found and fixed in `docker-compose.yml`

Manually cross-checked `docker-compose.yml` / `docker-compose.production.yml` /
`infrastructure/nginx/nginx.conf` / each service's Dockerfile against the actual env vars each
service reads today (`backend/config/services.php`, `whatsapp-gateway/src/config/env.ts`'s Zod
schema, `frontend/.env.example`). Found two real bugs that would have broken a live
`docker compose up`, both fixed:

1. **Backend → gateway URL was never overridden for the Docker network.** The `backend` service
   had no `WHATSAPP_GATEWAY_URL` override, so it would have fallen through to whatever's in
   `backend/.env` (`http://localhost:3000`, the non-Docker local-dev default) — inside the
   `backend` container, `localhost` means the backend container itself, not the
   `whatsapp-gateway` container, so backend → gateway internal calls (media signed URLs, send
   actions, etc.) would have failed silently or timed out. Fixed by adding
   `WHATSAPP_GATEWAY_URL: http://whatsapp-gateway:4000` and
   `WHATSAPP_GATEWAY_TOKEN: ${INTERNAL_GATEWAY_TOKEN:-...}` to the `backend` service's
   `environment:` block.
2. **`env_file: ./whatsapp-gateway/.env` (and `./backend/.env`) pointed at files that don't
   exist as committed repo state** (only `backend/.env` exists locally, from earlier phases'
   manual setup — `whatsapp-gateway/.env` and `frontend/.env` were never created, only their
   `.env.example`s are committed). Docker Compose treats a missing `env_file` path as a hard
   error by default, which would have made `docker compose config`/`up` fail immediately for
   anyone cloning fresh and running compose without first hand-creating those files. Fixed by
   marking both `env_file` entries `required: false` (Compose spec `path:`/`required:` long
   form) and adding explicit `environment:` overrides for every var the gateway's Zod env schema
   actually requires (`REDIS_PORT`, `MYSQL_PORT`, `INTERNAL_SHARED_SECRET`,
   `WHATSAPP_SESSION_DIR`, `INTERNAL_GATEWAY_TOKEN`, `CREDENTIALS_ENCRYPTION_KEY`,
   `WHATSAPP_WORKSPACE_ID`) with `${VAR:-default}` fallbacks, so a bare `docker compose up`
   works with zero manual `.env` setup (using clearly-insecure defaults that must be overridden
   for anything beyond a throwaway sandbox). Side note found while tracing this:
   `INTERNAL_SHARED_SECRET` and `LARAVEL_INTERNAL_API_URL` are required by the gateway's Zod env
   schema (`src/config/env.ts`) but grep found no actual gateway->backend call using either of
   them anywhere in `whatsapp-gateway/src` yet — they're validated-but-unused, presumably
   reserved for a not-yet-built gateway-initiated call into Laravel's internal API. Not a bug
   (the gateway still boots fine with a placeholder value), just worth knowing before assuming
   that direction of internal auth is already wired up.

Also updated the root `.env.example` to document the previously-missing
`WHATSAPP_GATEWAY_TOKEN` / `INTERNAL_GATEWAY_TOKEN` / `CREDENTIALS_ENCRYPTION_KEY` /
`WHATSAPP_WORKSPACE_ID` vars (present in the per-service `.env.example`s but absent from the
root reference file, which is what the new compose defaults key off).

`docker compose config` itself was **not run** — no Compose CLI to run it with. This is a
manual-review-and-fix pass; the actual fixed file has still never been validated by the tool
that would catch further YAML/schema issues. Flagged for the first environment with Docker
available.

Nginx config and Dockerfiles (backend PHP-FPM+alpine multi-stage, gateway Node 20 alpine
build+runtime split, frontend Node 20 alpine build+runtime split) were reviewed and look
consistent with current app structure; no changes made there.

### (b) CI — written, not executable here

Added `.github/workflows/ci.yml` (this repo had no `.github/` directory before this pass) with
three parallel jobs, each built from the *actual* scripts in each package's manifest, not
invented ones:
- **backend**: PHP 8.2, `composer install`, `vendor/bin/pint --test` (Pint is a real
  `composer.json` dev dependency), then `php artisan test`. No MySQL/Redis service container is
  configured for this job — `backend/phpunit.xml` pins `DB_CONNECTION=sqlite` /
  `DB_DATABASE=database/testing.sqlite` for the testing environment regardless of `.env`
  contents, so the real backend suite (196 tests) needs no external database service in CI.
- **gateway**: Node 20, `npm ci`, `npm run lint`, `npx tsc --noEmit` (no dedicated `typecheck`
  script exists in `whatsapp-gateway/package.json`, so `tsc --noEmit -p tsconfig.json` is invoked
  directly against the real tsconfig), `npm test` (against real MySQL 8 + Redis 7 service
  containers, since — unlike the backend — the gateway's Zod env schema hard-requires live
  `MYSQL_HOST`/`REDIS_HOST` connection details), then `npm run build`.
- **frontend**: Node 20, `npm ci`, `npm run lint`, `npx tsc --noEmit` (same reasoning — no
  `typecheck` script exists), `npm test` (Vitest, 12 tests), `npm run build`.

Validated by: (1) confirming every command referenced (`pint`, `test`, `lint`, `build`, the
gateway/frontend `test` scripts) actually exists in the respective `composer.json`/
`package.json` right now — not invented; (2) parsing the YAML with Python's `yaml.safe_load`
from this shell, which succeeded (`YAML OK`). **This workflow has never run on an actual GitHub
Actions runner** — no such runner is available in this environment. Same caveat as the
Playwright E2E suite from Phase 18: written and manifest-consistent, not executed.

### (c) Backup/restore — written AND actually tested against a real database

`infrastructure/scripts/mysql-backup.sh` and `infrastructure/scripts/mysql-restore.sh` (new
files): a plain `mysqldump`/`mysql` pair, reading `DB_HOST`/`DB_PORT`/`DB_DATABASE`/
`DB_USERNAME`/`DB_PASSWORD` (same names `backend/.env` already uses) with local-dev defaults.
Backup writes a timestamped `gzip`-compressed dump (`<db>_<YYYYmmdd_HHMMSS>.sql.gz`) via a
temp-file-then-rename so a failed run never leaves a corrupt file at the final path, and fails
loudly if the resulting dump is 0 bytes. Restore takes a dump path and an optional target DB
name (so it can restore into a scratch DB without touching the real one), creating the target
DB if it doesn't exist.

This was **actually run** against the local MySQL reachable in this environment (XAMPP's
`C:\xampp\mysql\bin`, database `crm_whatsapp`, `root`/no password — the same DB
`backend/.env` already points at):
- `mysql-backup.sh` produced a real, non-empty dump: `9502` bytes, gzip-compressed, in
  `storage/backups/crm_whatsapp_20260731_172834.sql.gz`. (One dropped flag along the way:
  `--set-gtid-purged=OFF` errored as "unknown variable" against this XAMPP mysqldump build, so
  it was removed rather than left as dead weight — restore correctness doesn't depend on it for
  a single-server dump/restore like this.)
- `mysql-restore.sh` was run against that exact dump, targeting a scratch database
  `crm_whatsapp_restore_test` (not the real `crm_whatsapp` DB). Verified for real, not assumed:
  `SHOW TABLES` on the restored DB listed the expected schema (contacts, conversations, deals,
  labels, invitations, audit_logs, ...), and a row-count cross-check
  (`SELECT COUNT(*) FROM crm_whatsapp.users` vs. `crm_whatsapp_restore_test.users`) matched
  exactly (`1` / `1`). The scratch database was dropped afterward to avoid leaving test-only
  state behind.

What's deliberately **not** scripted, documented instead per the task's own instruction:
- **MinIO/S3 bucket contents** (message attachments, report exports) need their own backup path
  in production — e.g. `mc mirror` (MinIO client) to a secondary bucket/region, or the cloud
  provider's native bucket replication/versioning. Out of scope for a MySQL-focused script.
- **.env secrets** (`APP_KEY`, `DB_PASSWORD`, `WHATSAPP_GATEWAY_TOKEN`,
  `CREDENTIALS_ENCRYPTION_KEY`, mail/SMTP credentials, etc.) should never land in a backup
  artifact written to shared/long-lived storage — manage and back those up via a dedicated
  secrets manager (Vault, AWS Secrets Manager, Doppler, etc.) instead, which has its own
  backup/rotation story. Deliberately not scripted here, since committing any script that
  touches real secret material would itself be a security smell.

## Phase 20 — Final Verification (next steps)

- Repository-wide audit for leftover placeholders, dead code, and TODOs across
  `backend/app`, `whatsapp-gateway/src`, `frontend/src` (the last full sweep was Phase 18's
  test-coverage gap analysis, not a placeholder/dead-code audit).
- Whichever environment picks this up next and *does* have Docker available should run the two
  compose files for real: `docker compose config` first (validate the fixes made in this phase
  actually parse), then a full `docker compose up -d --build` + health-check pass + 
  `docker compose down`, since that has never happened across this entire build.
- Similarly, the CI workflow added in this phase should get one real run on an actual GitHub
  Actions runner (push a branch / open a PR) to catch anything only a real runner would surface
  (network egress, service-container timing, cache behavior) — a YAML-syntax check and
  manifest-script cross-reference is not the same as a green run.
- Final production-readiness report: consolidate every "written but unexecuted" item flagged
  across Phases 18-19 (Playwright E2E suite, this phase's CI workflow, a full compose-up) into a
  single explicit checklist so whoever deploys this doesn't have to re-derive it from scattered
  `PROJECT_STATUS.md` sections.

## Phase 18 — Testing: closing real coverage gaps

A gap-filling pass, not a padding pass — every test added below targets a specific hole found
by auditing `app/Http/Controllers/Api/V1/*` against `tests/Feature/*.php` (backend), `src/**/*.ts`
against `*.test.ts` (gateway), and the complete absence of any frontend test tooling. All
counts below were produced by actually running the commands, not estimated.

### (a) Tests written AND passing in this environment

**Backend** (`php artisan test`): **173 → 196 passed** (593 → 745 assertions). New files, all
green:
- `tests/Feature/MediaTest.php` (5 tests) — `MediaController` had zero coverage before this;
  now covers the happy path (signed URL via a faked gateway call), media-not-belonging-to-message,
  message-not-belonging-to-conversation, cross-workspace 404, and a faked gateway 500 correctly
  surfacing as a 502 rather than leaking a raw error.
- `tests/Feature/NotificationPreferenceTest.php` (5 tests) — `NotificationPreferenceController`
  had zero coverage; covers the default-row-per-known-type behavior, upsert, invalid-type
  rejection, missing-required-field rejection, and per-user (not per-workspace) isolation.
- `tests/Feature/ReportExportTest.php` (6 tests) — `ReportExportController` had zero coverage;
  covers the permission gate, a real end-to-end queue → job → notification → download round trip
  (`Storage::fake('local')`, no mocking of the job itself), invalid type rejection, cross-user
  download rejection, and a missing-file-on-disk 404.
- `tests/Feature/RateLimiterTest.php` (5 tests) — closes the exact gap flagged at the end of
  Phase 17: the 5 new named rate limiters (`password-reset`, `invitation-accept`,
  `invitation-create`, `search`, `export`) had zero tests asserting the throttle actually
  engages. Each test drives real requests up to the documented per-minute limit and asserts the
  next one 429s.
- `tests/Feature/CrossModuleIntegrationFlowTest.php` (2 tests) — a genuine multi-step flow in one
  test: login (real token from `/auth/login` used for a subsequent request, not `asUser()`) →
  create contact → convert to lead → create deal → move through 2 pipeline stages → mark won →
  assert the dashboard summary (a different controller entirely) reflects the won value and new
  lead count, plus a full `deal_stage_history` trail. A second test proves the same flow's
  contact is a real 404 (not just a permission 403) to a user in an independently-seeded second
  workspace.

Notable fix made while writing these: the workspace-isolation test needed
`Role::withoutGlobalScopes()` and `Auth::forgetGuards()` before re-seeding
`RolePermissionSeeder` for a second workspace — `Role` uses `BelongsToWorkspace`, so seeding
under an already-authenticated user's guard would have silently written the new roles onto the
wrong workspace. Documented in the test itself so the next person doesn't repeat the mistake.

**whatsapp-gateway** (`npx vitest run`): **28 → 51 passed**. New files, all green:
- `src/lib/backoff.test.ts` (6 tests) — `computeBackoffDelayMs` had zero coverage; covers
  exponential growth, the exact max-retry boundary (attempt where the exponential first reaches
  `maxMs`), non-positive attempt numbers, and jitter bounds.
- `src/whatsapp/message-normalizer.test.ts` (10 tests) — zero coverage before this; specifically
  targets malformed/partial Baileys payloads (missing `key.id`, missing `key.remoteJid`, null
  `message`, empty media content object) and confirms every case resolves to `{ ok: false,
  reason }` rather than throwing, plus the happy paths (text, extendedText, media with
  string-vs-number `fileLength`, reaction messages tagged distinctly).
- `src/routes/internal-whatsapp.auth-boundary.test.ts` (7 tests) — the internal-gateway-token
  gate (`requireInternalToken`) was previously only exercised incidentally (every other route
  test always sent a valid token). Now tested directly: no header, empty header, wrong token, a
  token that's a strict prefix of the real one, and confirms the gate applies uniformly across a
  GET route, a POST route, and the body-validated `messages/send` route (rejects before body
  validation ever runs).
- The previously-flagged flaky `connection-manager.test.ts` QR-status timing test did **not**
  reproduce in either full-suite run this session (ran twice, 51/51 both times) — left as-is
  rather than "fixed" against a failure that didn't recur; still worth a dedicated look if it
  resurfaces in CI.

**frontend**: had **zero test tooling** before this pass (`package.json` had no test script, no
Vitest/Jest/RTL dependency). Set up Vitest + React Testing Library (the lightest fit alongside
the existing Next.js 16 + TS + Tailwind stack, per the task's own suggestion) — added
`vitest.config.ts`, `vitest.setup.ts`, a `test` script, and
`@vitejs/plugin-react`/`jsdom`/`@testing-library/{react,jest-dom,user-event,dom}` as new
devDependencies. `npx vitest run`: **0 → 12 passed** across 4 new files:
- `src/app/(auth)/login/login-page.test.tsx` (4 tests) — empty-form validation errors, malformed
  email rejection, a full valid-submit → `login()` call → redirect to `/inbox`, and an
  `ApiError` from a rejected login rendering inline without redirecting.
- `src/components/auth/require-permission.test.tsx` (2 tests) — `RequirePermission` (mocking
  `useAuth().can`) actually hides its children and redirects to `/unauthorized` when the
  permission is absent, and renders normally when present — the concrete "permission-gated
  component hides content for a role lacking the permission" check the task asked for.
- `src/lib/api-client.test.ts` (3 tests) — the axios response interceptor's 401 handling: clears
  the stored token, dispatches `auth:session-expired`, and redirects to `/login?from=...` on a
  401; does *not* redirect if already on `/login`; a non-401 error passes through without
  touching the token.
- `src/components/contacts/contact-form.test.tsx` (3 tests) — **substituted for the suggested
  "deal creation - negative value rejected" example**, because deal creation in this codebase
  has no dedicated Zod-validated form component (`deals-api.ts`'s `DealFormValues` is posted
  directly without a client-side schema) — see the "gaps knowingly left" note below.
  `ContactForm`'s real Zod schema is exercised instead: malformed email rejected, a 256-char
  name rejected (`max(255)`), and blank optional fields correctly submit as `null`.

`npm run lint` and `npm run build` were re-run after all of the above and both still succeed
(29 routes, same as Phase 16/17).

### (b) Tests written but requiring infrastructure not available here

`e2e/` (new top-level directory, sibling to `backend/`/`frontend`/`whatsapp-gateway/`): a real,
committed Playwright suite — `playwright.config.ts`, `tests/fixtures.ts` (login helper + seeded
test users), and 6 spec files (`auth`, `whatsapp`, `inbox`, `crm`, `tasks`, `admin`.spec.ts)
covering all **23 flows** from the original spec (login, password reset, invitation,
role restriction, QR connection, incoming/outgoing message, delivery ack, assignment, internal
note, contact update, convert-to-lead, create deal, move stage, mark won, create task, task
reminder, search, dashboard filter, export report, audit log review, suspend user,
cross-workspace rejection). **Never executed** — no Playwright browser install and no live
`docker-compose` stack (backend + gateway + frontend + MySQL + Redis all running together) has
ever been brought up in this build. Selectors were written against the real rendered
markup/labels found by reading the actual page components, not guessed, but first-run selector
drift should be expected and is not itself a sign of an app bug. `e2e/README.md` spells out
exactly what's needed to run it (`npm install`, `npx playwright install`, seeded test users, env
vars) and flags that the WhatsApp flows additionally need a test-adapter/simulator for Baileys
events that does not exist yet in this codebase (a Phase 19+ prerequisite, not built this pass).

Performance/load testing (message throughput, search, analytics queries under representative
volume) was not attempted for the same reason stated in Phase 17: no environment here can run a
sustained load against a live full stack. Not fabricated, not attempted.

### (c) Coverage gaps knowingly left for a future pass, with reasoning

- **Deal creation has no client-side Zod schema / negative-value guard.** Confirmed by reading
  `frontend/src/lib/deals-api.ts` and grepping for a `DealFormValues`-consuming form component —
  none exists with a `z.object(...)` schema (unlike `ContactForm`). Whatever validation exists
  today is server-side only (`backend/app/Http/Controllers/Api/V1/DealController.php`'s
  `FormRequest`). Left as a gap rather than inventing a UI form/schema that isn't otherwise part
  of this build — flagged for Phase 19 as a real product gap, not just a test gap.
  `DealTest.php`'s backend coverage of negative/boundary `value_amount` values was not
  separately re-audited in this pass either; worth a dedicated boundary-value sweep (negative
  amounts, `expected_close_date` in the past) across `DealTest`/`LeadTest` next.
- **Gateway's `connection-manager.test.ts` flaky QR-status test** — did not reproduce this
  session (2/2 clean full-suite runs), so left untouched rather than changing timing-sensitive
  source code against a failure nobody could currently reproduce. If it reappears, treat it as
  a real assertion/timing bug, not "known flaky" by default.
- **Concurrency-adjacent correctness beyond what's testable single-threaded**: duplicate
  `whatsapp_message_id` (unique-constraint) and duplicate `idempotencyKey` replay were already
  covered pre-Phase-18 (`MessageUniqueConstraintTest`, `send-message.queue.test.ts` /
  `internal-whatsapp.messages-send.test.ts`) by issuing the same key/id twice sequentially in
  one process — true concurrent-request races were not (and cannot meaningfully be) exercised
  without a real multi-process/multi-connection load harness. Noted as a real limit of
  single-process test suites, not something this pass could close.
- **Soft-delete/restore edge cases**: `ModelRelationshipsAndSoftDeletesTest` and per-module tests
  (contacts, leads, deals) already cover basic delete/restore; a dedicated sweep of
  restore-after-delete permission checks per role (can a Manager restore what an Agent deleted?)
  was not added this pass — flagged, not done.
- **Full 5-role × representative-endpoint permission matrix**: `PermissionCatalog`/`AdminSuite`/
  per-module tests already spot-check 2-4 roles per sensitive endpoint; a single parametrized
  test iterating all 5 roles × every permission from `docs/07-permission-matrix.md` (as
  originally envisioned by `docs/09-testing-strategy.md`'s `PermissionMatrixTest`) still does
  not exist as one suite — coverage is real but scattered across files, not consolidated.

### Phase 19 — next steps (DevOps, per the roadmap)

- **CI workflow**: no `.github/workflows/*` (or equivalent) exists yet in this repo. Add one
  running, per service: lint + typecheck, the unit/feature suites above, and (once a Playwright
  browser + docker-compose CI profile exist) the `e2e/` suite as a separate, allowed-to-be-slow
  job.
- **Verify `docker-compose.yml` actually builds and starts all services together** — this has
  never been done in this whole build (explicitly noted in Phase 17 and again here). This is a
  precondition for the `e2e/` suite in this PR ever running for real.
- **Backup/restore scripts** for MySQL (+ the gateway's session-credential store) — not
  present yet; needed before any real staging/production cutover.
- Build the Baileys test-adapter/simulator referenced in `e2e/README.md` so the WhatsApp-flow
  specs are actually runnable in CI without touching real WhatsApp.
- Close the specific gaps listed in (c) above: a real deal-creation UI Zod schema (or an explicit
  decision that server-side validation alone is sufficient, documented as such), a consolidated
  `PermissionMatrixTest`, and a restore-after-delete-by-role sweep.

## Phase 17 — Security Hardening

A review-and-fix pass across `backend/`, `whatsapp-gateway/`, and `frontend/`, done by actually
reading the code (grep + file reads), not assuming prior phases were complete. Every claim below
was checked against real source; test/build commands were actually run and their output is
reported as-is.

### Verified solid, no change needed

- **Workspace isolation** (`backend/app/Models/Scopes/WorkspaceScope.php` +
  `Concerns/BelongsToWorkspace.php`): cross-checked every model in `app/Models` against every
  migration that adds a `workspace_id` column. Every table with a `workspace_id` column has a
  model using `BelongsToWorkspace`. Models without the trait (`ConversationAssignment`,
  `ConversationParticipant`, `DealStageHistory`, `MessageMedia`, `MessageReaction`,
  `MessageStatusEvent`, `NoteMention`, `NotificationPreference`, `PipelineStage`, `TaskComment`,
  `TaskReminder`, `UserPresence`, `WhatsappSessionCredential`) are all child rows of an
  already-scoped parent (Conversation/Deal/Message/InternalNote/User/Task/WhatsappSession/Pipeline)
  and none has a `workspace_id` column or fillable — no gap found.
- **CORS** (`backend/config/cors.php`): origins come from `env('FRONTEND_URL')`, not a wildcard;
  `supports_credentials => true` is paired with a concrete origin list, which is the correct
  combination (browsers reject `*` + credentials anyway, but this confirms it wasn't relying on
  that browser behavior as the only safeguard).
- **Mass assignment**: spot-checked `User`, `Role`, `Workspace`, `Invitation` — sensitive fields
  (`workspace_id`, `is_system`, `password`) are fillable, but grepped every controller for
  `::create($request->all())` / `->update($request->all())` and found none; all controllers build
  explicit arrays or use `$request->validated()` (e.g. `AuthController`, `RoleController`). Mass
  assignment is contained by controller discipline, not by `$guarded`, so this remains something to
  keep an eye on for any new controller — flagged, not a bug.
- **File uploads**: contact CSV import (`ContactController::import`) validates
  `mimes:csv,txt|max:5120`; workspace logo upload (`WorkspaceSettingController::updateSettings`)
  validates `image|max:2048`, and both rely on Laravel's `Storage::store()` for filename generation
  (hashed, not user-supplied), so no path-traversal vector via a crafted filename.
- **Password/token policy**: `forgotPassword`/`resetPassword` use Laravel's built-in `Password`
  broker (60-minute token expiry from `config/auth.php`, tokens revoked on reset via
  `$user->tokens()->delete()`); invitation tokens expire in 7 days and `acceptInvitation` checks
  `expires_at` before accepting. Every `auth:sanctum` route group in `routes/api.php` is paired with
  `active` (`EnsureUserIsActive`) — no route was found using `auth:sanctum` alone.
- **Error detail filtering**: `config('app.debug')` defaults to `false`
  (`env('APP_DEBUG', false)`); `bootstrap/app.php`'s `withExceptions()` normalizes validation/auth/
  authorization/not-found exceptions into the app's `{success,message,errors}` envelope without
  leaking internals; anything else falls through to Laravel's own debug-gated renderer.
- **SQL injection**: every raw query (`AnalyticsController`, `DashboardController` — all
  `selectRaw`) uses static string literals only, no interpolated user input.
- **Audit logging**: confirmed ~60 distinct `AuditLogger::log()` call sites cover
  `auth.login`/`auth.login.failed`/`auth.logout`/`auth.password_reset`, `user.suspended`/
  `user.reactivated`, `role.created`/`role.updated`/`role.deleted`, `invitation.*`, and all
  CRUD-level actions across contacts/leads/deals/tasks/pipelines/teams/labels/notes/workspace
  settings.
- **Gateway credential encryption** (`whatsapp-gateway/src/lib/crypto.ts`): AES-256-GCM, a fresh
  random 12-byte IV per call, key read from `env.CREDENTIALS_ENCRYPTION_KEY` (not hardcoded), auth
  tag verified on decrypt. Grepped every `logger.*()` call for credential/token/secret/value
  content — only counts/ids are logged (`session-repository.ts:188`), never plaintext.
- **Gateway internal API auth** (`whatsapp-gateway/src/routes/internal-whatsapp.routes.ts`):
  `router.use(requireInternalToken)` is applied at the router root, so every route mounted on it is
  covered — confirmed by reading the file rather than trusting the description. Comparison is a
  plain `!==`, not constant-time, which is a theoretical timing-attack surface on a
  service-to-service shared secret; low priority, noted rather than fixed this pass.
- **Frontend XSS**: grepped the entire `frontend/src` tree for `dangerouslySetInnerHTML` — zero
  matches. Search-result highlighting and message/note rendering all go through normal React text
  interpolation (auto-escaped).
- **Frontend token storage** (`frontend/src/lib/token-store.ts`): already carries an honest
  in-code tradeoff comment from Phase 3 — token is kept in-memory for runtime reads and mirrored to
  `localStorage` only so a reload survives; this remains readable by any script on the page if the
  app is ever XSS'd. Re-verified the comment still matches the code (it does) rather than
  re-architecting to httpOnly cookies, which would require backend cookie issuance changes beyond
  this pass's scope.

### Found and fixed

- **Rate limiting gaps** — `backend/routes/api.php` had `throttle:login` on `/auth/login` only;
  `forgot-password`, `reset-password`, `invitations/accept` (all unauthenticated, abuse-prone) and
  `invitations` create, `/search`, `contacts/export`, `reports/export` (authenticated but
  expensive/abuse-prone) had no throttle at all. Added five new named limiters in
  `backend/app/Providers/AppServiceProvider.php` (`password-reset`, `invitation-accept`,
  `invitation-create`, `search`, `export`) and wired `throttle:<name>` onto each route in
  `backend/routes/api.php`.

### Known / accepted risk (not fixed this pass)

- **Sanctum token expiration** (`backend/config/sanctum.php`): `'expiration' => null` — tokens
  never expire on their own; logout/password-reset revoke them, but there is no rolling expiry.
  Changing this is a behavior change (would need frontend re-auth handling) beyond a hardening
  spot-fix, so left as a documented risk rather than changed blind.
- **Gateway outbound media upload path**: no `multer`/upload middleware was found anywhere in
  `whatsapp-gateway/src`, and `backend/app/Http/Controllers/Api/V1/MediaController.php` only proxies
  *reads* (signed-URL access to already-stored media) — the actual outbound attachment upload
  endpoint could not be located in this pass. This needs a follow-up look before calling outbound
  media upload security verified either way.
- **`npm audit` findings, both `whatsapp-gateway/` and `frontend/`**: all high-severity findings are
  in the `eslint`/`postcss`/`sharp` transitive dev/build toolchain (via `eslint-config-next` →
  `minimatch`/`brace-expansion`, and `next`'s bundled `postcss`/`sharp`), not runtime application
  code. `npm audit fix --force` on the frontend would downgrade `next` to `9.3.3` — a multi-major
  regression — so this was reported, not blindly applied. `composer audit` on `backend/` reported
  **no vulnerabilities**.
- No production TLS/real domain exists in this environment, so CORS/cookie/HSTS behavior could only
  be verified by reading config, not by an actual credentialed cross-origin request test.

### Verification run (actually executed, this session)

- `backend`: `php artisan test` → **173 passed** (593 assertions), after the rate-limiter route
  changes above.
- `whatsapp-gateway`: `npx vitest run` → **27 passed, 1 failed** first run
  (`connection-manager.test.ts > persists and emits on QR event`, a status-timing assertion);
  re-ran that file alone and it passed 5/5 — confirmed flaky/timing-sensitive, not caused by this
  phase (no gateway source files were changed in this pass).
- `frontend`: `npm run lint` → clean; `npm run build` → succeeds, all 29 routes still present.

### Phase 18 — next steps

The roadmap calls for broader test coverage beyond what has accumulated incidentally
phase-by-phase:
- Expand backend feature/unit tests beyond the current 173 (notably: no dedicated test yet for the
  new Phase 17 rate limiters — add throttle-hit assertions for `password-reset`, `invitation-*`,
  `search`, `export`).
- Fix or quarantine the flaky `connection-manager.test.ts` QR-status timing test in
  `whatsapp-gateway` so a real regression doesn't hide behind "known flaky."
- Add gateway-side tests for the internal-token auth boundary specifically (currently covered
  incidentally via other route tests, not as its own auth-boundary test).
- Locate and test (or explicitly build, if it doesn't exist) the outbound media upload path flagged
  above as unverified.
- Frontend: add component/e2e tests (none currently exist beyond lint+build+type-check) — at least
  smoke coverage of login, inbox send, and the settings/admin CRUD screens.
- Performance/load testing (message throughput, search, analytics queries) — not attempted in any
  phase so far.

## Phase 16 — Full UI/UX Polish Pass (this update)

Audit-and-fix pass across all ~29 frontend routes. `backend/` and `whatsapp-gateway/` were not
touched. No browser/screenshot capability is available in this environment, so everything below
is a **code-level audit** (grep + file reads across the whole `frontend/src` tree) verified by
`npm run lint` and `npm run build`, not a visual/rendered check — called out explicitly per
route category below.

### 1. Design tokens — verified consistent, no fix needed

`frontend/src/app/globals.css` and `tailwind.config.ts` already define the exact palette from the
brief (`--color-primary #16a34a`, `primary-dark #15803d`, `primary-soft #dcfce7`, `bg #f8fafc`,
`surface #fff`, `border #e2e8f0`, `text #0f172a`, `muted #64748b`, `success/warning/danger/info`
matching spec), exposed as Tailwind utilities (`bg-primary`, `text-danger`, etc.) plus a dark-mode
step via `@media (prefers-color-scheme: dark)`. Grepped every `.tsx` file for raw hex codes and
Tailwind default color utilities (`bg-red-500`, `text-slate-400`, etc.) — the only ad-hoc hex
values found are in `settings/labels/page.tsx`, `label-badge.tsx`, `label-filter-chips.tsx`, and
`label-picker.tsx`, which are the **user-chosen label swatch colors** (a real data field, not
branding), so left as-is. No second palette or drifted branding color found anywhere.

### 2. Fixed: no mobile navigation existed at all

`components/layout/sidebar.tsx` was `hidden ... md:flex` with zero fallback below `md` — confirmed
the gap flagged at the end of Phase 15. Added:
- `components/layout/mobile-sidebar-context.tsx` (new) — a small client context for open/close
  state shared between the topnav and sidebar.
- `components/layout/sidebar.tsx` — now renders the existing desktop `<aside>` unchanged on
  `md:flex`, plus a slide-in drawer (`fixed inset-0 z-50 md:hidden`) with a backdrop button, close
  button, and the same nav list (closes on link click).
- `components/layout/topnav.tsx` — added a `Menu` hamburger button (`md:hidden`) that opens the
  drawer, `aria-label="Open navigation menu"`.
- `app/(dashboard)/layout.tsx` — wraps the shell in `MobileSidebarProvider`; `<main>` padding
  changed to `p-4 sm:p-6` so mobile content isn't over-padded, and `overflow-x-hidden` added to
  the scroll container as a defensive measure against any remaining wide content.

### 3. Fixed: inbox was unusable below the `lg` breakpoint

`app/(dashboard)/inbox/layout.tsx` used `hidden h-full lg:block` around the conversation list with
**no mobile equivalent** — below `lg`, a user landing on `/inbox` saw only the "select a
conversation" placeholder with no way to ever see the list, and a user in a thread had no way back.
Fixed with a new `components/inbox/inbox-shell.tsx` (client component, `usePathname`-driven):
shows the conversation list on `/inbox` and the thread on `/inbox/[conversationId]`, one at a time,
below `lg`; both panes remain side-by-side at `lg` and up exactly as before. Added a mobile-only
back button (`ArrowLeft`, `lg:hidden`) to the thread header in `components/inbox/chat-panel.tsx`
linking back to `/inbox`. This is the change with the highest confidence of a previously-broken
mobile experience in the whole app — recommend an actual device/browser check in a follow-up pass
since it could not be visually verified here.

### 4. Fixed: destructive actions with no confirmation

Found three fully un-confirmed destructive actions (styled danger/red but firing immediately on
click) via grep for delete/suspend handlers versus existing `confirm(`/dialog usage:
- `app/(dashboard)/leads/[id]/page.tsx` — "Delete lead" had no confirmation. Added
  `window.confirm(...)`, matching the pattern already used in `tasks/[id]/page.tsx`.
- `app/(dashboard)/settings/pipelines/page.tsx` — both "Remove stage" and "Delete pipeline" fired
  immediately. Added `window.confirm(...)` to both, with the pipeline one naming the pipeline and
  warning its stages are removed too.
- `app/(dashboard)/settings/users/page.tsx` — "Suspend" had no confirmation and was styled
  identically to the neutral "Edit"/"Reactivate" buttons (no danger color). Added a confirm on
  suspend only (not reactivate, which isn't destructive) and restyled the button
  `border-danger text-danger` when it will suspend.
- `app/(dashboard)/contacts/[id]/page.tsx` — "Archive contact" (reversible via restore, but still
  removes it from the active list) had no confirmation; added one.
- Left as-is: `settings/whatsapp/page.tsx` (disconnect) already has a proper custom
  `DisconnectDialog`; `tasks/[id]/page.tsx` delete and `settings/roles`/`teams`/`labels` deletes
  already used `confirm(...)`.

### 5. Fixed: list-page error states were dead-end text with no retry

Every list page's `isError` branch across the codebase was a bare `<p className="text-danger">`
with copy like "Try again shortly" but **no actual retry action** — the user's only recourse was a
full page reload. Added a shared `components/ui/error-state.tsx` (message + Retry button wired to
the query's own `refetch()`) and applied it to: `contacts/page.tsx`, `leads/page.tsx`,
`tasks/page.tsx`, `pipeline/page.tsx`, `settings/audit-log/page.tsx`, `settings/users/page.tsx`,
`settings/teams/page.tsx`, `settings/roles/page.tsx` (retries both the roles and permission-catalog
queries), `settings/labels/page.tsx`, `settings/pipelines/page.tsx`, and
`components/inbox/conversation-list-panel.tsx`. Skeletons and empty states on these same pages were
already present and consistent (the `TableSkeleton` / `ListSkeleton` animate-pulse pattern from
`contacts/page.tsx`, used as the reference implementation) — no changes needed there.

### 6. Fixed: audit-log table had no horizontal-scroll wrapper

`settings/audit-log/page.tsx`'s 5-column table had no `overflow-x-auto`/`min-w` wrapper, unlike
`contacts`/`leads`/`tasks` (`min-w-[720px]` inside `overflow-x-auto`). Added
`overflow-x-auto` + `min-w-[640px]` to match the established pattern — this and `settings/users`
(which already had it) are now consistent; every other data table in the app already had the
wrapper.

### 7. Accessibility fixes

- Added a global `@media (prefers-reduced-motion: reduce)` rule in `app/globals.css` collapsing
  all animation/transition durations to ~0 — previously **not handled anywhere**, so
  `animate-pulse` skeletons and hover transitions ignored the OS-level preference entirely.
- `settings/pipelines/page.tsx` stage-name rename `<input>` had no accessible label (bare
  `defaultValue`, no `aria-label`) and used `focus:outline-none` with only a border-color change
  on focus (barely visible, no ring). Added `aria-label="Stage name (...)"` and swapped to
  `focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary`. Grepped the whole
  tree for `outline-none` outside a `focus:ring`/`focus-visible` pairing — this was the only match,
  so no other focus-state suppression exists.
- Spot-checked icon-only buttons app-wide (`notification-bell.tsx`, `global-search-bar.tsx`, the
  sidebar/topnav) — all already carry `aria-label`s; new hamburger/close/back buttons added in
  this phase also carry them (`"Open navigation menu"`, `"Close navigation menu"`, `"Back to
  conversation list"`).
- Form labels: spot-checked `components/contacts/contact-form.tsx` and others — every input uses
  `<label htmlFor>` / matching `id`, established pattern, no drift found in the files reviewed.

### 8. Verified, no changes needed

- **Internal notes vs. customer messages** (Phase 10): `components/inbox/chat-panel.tsx` still
  renders internal notes in a distinct amber banner (`border-amber-200 bg-amber-50` panel, amber
  message pills) separate from the normal inbound/outbound message bubbles
  (`justify-start`/`justify-end` on `message.direction`). Visually distinct, functioning as
  designed. Note: this amber scale is Tailwind's default palette, not the shared `--color-warning`
  token (which has no shade ramp) — left alone rather than risk a visual regression on a
  known-working, explicitly-called-out Phase 10 feature with no way to visually re-verify a
  change here; flagged as a Phase 17+ candidate if a token-based warning ramp is ever added.
- **Permission-based hiding** (spot-checked `settings/teams/page.tsx`, `settings/pipelines`,
  `settings/users`): destructive/manage buttons are wrapped in `{canManage && (...)}` — genuinely
  absent from the DOM for unauthorized roles, not merely `disabled`. The one `disabled={!canManage}`
  found (`settings/teams/page.tsx` team-name-as-rename-trigger) is a non-destructive label, not an
  action that should be hidden per the permission matrix.
- **Responsive audit** of the four representative pages named in the brief:
  - Dashboard (`app/(dashboard)/dashboard/page.tsx`): stat grids already `grid-cols-2
    md:grid-cols-4`, chart section `grid md:grid-cols-2` — correctly collapses to single/double
    column on mobile.
  - Settings pages: tables use `overflow-x-auto` + `min-w-[720px]` (contacts/leads/tasks pattern);
    `settings/roles` filter uses `min-w-[180px] flex-1`, fine at all sizes.
  - List+detail pages (contacts, leads, tasks): tables scroll horizontally inside their card at
    narrow widths rather than blowing out the page; detail pages are `max-w-3xl mx-auto` single
    columns, already mobile-safe.
  - Inbox: see item 3 above — this was the one page that was actually broken.

### Known gaps / could not verify visually

- **No visual/browser verification was possible in this environment** — every finding above came
  from static code reading (grep for utility classes, fixed widths, `overflow-x-auto`, ad-hoc
  hex/Tailwind-default colors, `confirm(`/dialog usage, `aria-label`, `outline-none`) plus
  `npm run lint` / `npm run build`, never a rendered screenshot. The mobile drawer, inbox mobile
  shell, and reduced-motion CSS should get an actual device/browser smoke test before being
  considered fully verified.
- Not every one of the ~29 routes got a line-by-line pass (effort was concentrated on the list
  pages, inbox, and settings/admin pages named in the brief, plus a tree-wide grep sweep for the
  specific anti-patterns above) — `search`, `calendar`, `dashboard` detail widgets, and the
  `contacts/new` multi-step form were grep-checked for the same anti-patterns but not re-read
  top-to-bottom.
- Internal-notes amber styling is off-token (Tailwind default `amber-*` shades vs. the shared
  `--color-warning`); intentionally left alone this phase (see item 8).
- `npm run lint`: clean (0 errors/warnings). `npm run build`: clean TypeScript + Turbopack build,
  all 27 previously-listed routes still present (route list unchanged from Phase 15 — this was a
  polish pass, not a new-route phase).

## Phase 17 — Security Hardening (next steps)

- Workspace isolation re-verification: re-run/expand the cross-workspace 404 checks already
  present for a few resources (e.g. Phase 15's audit-log isolation test) across every
  workspace-scoped model and controller, not just the ones with existing coverage.
- Rate limiting audit: confirm throttle middleware exists (and is tuned sensibly) on
  auth endpoints (login/forgot-password/reset-password/accept-invitation), the WhatsApp
  webhook ingestion endpoint, and any public-facing endpoint; add where missing.
- CORS/CSRF/XSS/SQLi checks: verify Sanctum's stateful-domain / CORS config matches the actual
  deployed frontend origin(s) (not a wildcard); confirm all Eloquent queries use parameter
  binding (no raw string interpolation); confirm any HTML rendered from user input (message
  bodies, notes, contact fields) is escaped/sanitized on the frontend, not just relying on React's
  default escaping in unexpected spots (e.g. `dangerouslySetInnerHTML` usage, if any).
- File upload validation: review `MediaController`/`GatewayClient` and the workspace-logo upload
  path (`WorkspaceSettingController`) for MIME-type sniffing (not just extension/declared
  content-type), size limits enforced server-side (not just client-side), and stored filenames
  that can't be used for path traversal.
- Credential encryption review: confirm WhatsApp gateway credentials/session tokens and any
  third-party API keys are encrypted at rest (Laravel's `encrypted` cast or equivalent), never
  logged, and never returned in any API response (the Phase 15 workspace-settings `storage` block
  was explicit about excluding keys/secrets — extend that same review to every settings/config
  endpoint).
- Dependency audit: run `composer audit` / `npm audit` (both `backend/` and `frontend/`, plus
  `whatsapp-gateway/`) and address any high/critical advisories.

## Phase 15 — Workspace Settings & Audit Log Viewer (this update)

### Backend (`backend/`)

- **Schema audit first, per instructions**: `workspaces` (name/slug/whatsapp_number/timezone/
  logo_path/is_active) and `workspace_settings` (1:1, business_hours/default_pipeline_id/
  notification_defaults/branding as JSON columns) already existed from Phase 3 — confirmed via
  `database/migrations/2026_07_31_08000{1,27}_*` and `App\Models\Workspace`/`WorkspaceSetting`.
  There are **no password-policy, session-timeout, or data-retention columns anywhere** in the
  schema. Per the explicit instruction not to invent columns without a migration, those two
  spec'd sections ("security settings", "data retention") are surfaced as **read-only**:
  security pulls real, currently-enforced values from `config/session.php` and
  `config/sanctum.php` (session lifetime, expire-on-close, token expiration); data retention
  is an informational note stating no retention policy exists yet and what a future migration
  would need to add. Nothing was invented as a fake toggle.
- **`WorkspaceSettingController`** (new): `GET/PATCH/POST /api/v1/workspace`, gated
  `workspace.settings.manage` for both read and write (the permission matrix has no separate
  view-only variant for this one, unlike roles/teams — confirmed against
  `docs/07-permission-matrix.md` before gating both verbs the same way). Handles name/timezone/
  business_hours/default_pipeline_id/notification_defaults/branding, plus logo upload (image,
  max 2MB) via `Storage::disk('public')`, replacing any prior logo file. Response includes a
  read-only `storage` block (active filesystem driver + bucket + endpoint, **no keys/secrets**)
  and `security` block described above. `POST` is accepted alongside `PATCH` specifically so the
  frontend can multipart-upload the logo file (`_method=PATCH` override), since PHP/Laravel
  cannot parse `multipart/form-data` on a true PATCH request.
- **`AuditLogController`** (new): `GET /api/v1/audit-logs` (filters: `date_from`/`date_to`/
  `user_id`/`action`/`subject_type`, paginated) and `GET /{auditLog}` (detail), gated
  `audit_logs.view`. Confirmed `App\Support\AuditLogger::log()` — used by every gated mutation
  since Phase 3, including all of Phase 14's admin endpoints — already populates
  actor/action/subject_type/subject_id/ip_address/user_agent/created_at on every call site
  checked. **Known gap, called out rather than silently patched**: the `changes` column is a
  flat array of "the data that changed" as each call site passes it (e.g.
  `RoleController::update` passes the validated request payload) — **no call site captures a
  true "before" snapshot**, so there is no real before/after diff anywhere in the system today.
  Retrofitting ~15 existing `AuditLogger::log()` call sites to capture pre-mutation state was
  judged out of scope for this phase (explicitly told not to do a "giant retroactive rewrite").
  The detail endpoint is honest about this: it returns `before: null` always and `after`/
  `changes` as aliases of the one real value captured, rather than fabricating a `before` that
  was never recorded.
- Both new endpoints registered in `routes/api.php` behind `permission:workspace.settings.manage`
  / `permission:audit_logs.view` middleware (same pattern as Phase 13's analytics routes — no
  new Policy classes needed since these aren't per-model resources).
- **Tests** (`tests/Feature/WorkspaceSettingsAndAuditLogTest.php`, 10 new, all passing):
  permission enforcement (Agent/Manager forbidden, Administrator allowed) for both endpoint
  groups; workspace profile/business-hours/default-pipeline/notification-defaults update
  persists to both `workspaces` and `workspace_settings` tables; logo upload stores to the fake
  public disk and returns a `logo_url`; workspace-settings update writes an audit log row;
  audit log list pagination (`per_page`, `meta.total`/`last_page`) and filtering by
  `action`/`user_id`; audit log detail returns `after`/`changes` populated and `before` null
  (honest about the schema gap above); audit log workspace isolation (a foreign workspace's log
  entry 404s and never appears in another workspace's list). `php artisan test`: **173/173
  passing** (163 pre-existing + 10 new), no regressions.

### Frontend (`frontend/`)

- New `/settings/workspace`: profile form (name, timezone, default pipeline dropdown), logo
  upload with live preview, notification-defaults checkboxes (workspace-wide defaults, distinct
  from Phase 12's per-user preferences — explicitly labeled as such in the UI so the distinction
  isn't lost on users), and two read-only sections (storage configuration, security) plus a
  data-retention informational note matching the backend's honest "not configurable yet"
  stance. Gated `workspace.settings.manage`. New `src/lib/workspace-api.ts` +
  `src/hooks/use-workspace-settings.ts`.
- New `/settings/audit-log`: filterable (date range, actor dropdown sourced from the existing
  `useUsers()` directory, action text, entity-type text) paginated table; row click opens a
  detail drawer showing actor/entity/timestamp/IP/user-agent plus "Before" and "After / recorded
  changes" JSON blocks (before always renders as `—` per the backend's honest gap above, rather
  than a misleading blank diff). Gated `audit_logs.view`. New `src/lib/audit-log-api.ts` +
  `src/hooks/use-audit-logs.ts`.
- Sidebar: added "Workspace Settings" (`workspace.settings.manage`) and "Audit Log"
  (`audit_logs.view`) entries, following the same permission-gating pattern as every other
  admin entry.
- `npm run lint`: clean. `npm run build`: clean TypeScript + Turbopack build. Route list (29
  routes, +2 vs. Phase 14): all previous routes unchanged, plus `/settings/workspace` (○) and
  `/settings/audit-log` (○).

### Known gaps / left for Phase 16

- **No true before/after audit diff exists anywhere in the system** (see backend section above)
  — if this is needed later, it requires updating every `AuditLogger::log()` call site to pass
  a captured pre-mutation snapshot, not just this phase's browsing API.
- Security/data-retention sections are read-only informational displays, not configurable
  settings — making them configurable requires a new migration adding actual columns
  (`workspace_settings.session_timeout_minutes`, `password_policy` JSON, `data_retention_days`,
  etc.), which was out of scope per this phase's "don't invent columns" instruction.
- Workspace logo upload uses the local/public Laravel disk (`Storage::disk('public')`), not the
  gateway's MinIO bucket used for WhatsApp media (`MediaController`/`GatewayClient`) — those are
  two separate storage paths by design (workspace logos are a small Laravel-native asset, chat
  media is proxied through the gateway's signed-URL flow) — not consolidated in this pass.

## Phase 16 — Full UI/UX Polish Pass (next steps)

- Design-token/color consistency audit across all ~29 routes built so far against the palette
  specified in the original brief — check for any component still using ad-hoc hex values or
  Tailwind defaults instead of the shared `text`/`muted`/`surface`/`bg`/`border`/`primary`/
  `danger`/`success` token set already used throughout (this phase's two new pages follow that
  convention; verify nothing upstream drifted).
- Responsive audit: every route needs a real check at mobile/tablet breakpoints, not just
  desktop — the sidebar (`src/components/layout/sidebar.tsx`) is already `hidden ... md:flex`,
  implying no mobile nav exists at all yet; this needs a resolution (hamburger/drawer or
  explicit "desktop only" decision) rather than silently leaving the app unusable at will
  is not resolved as of this update.
- Accessibility pass: keyboard navigation, focus states, ARIA labels/roles, color contrast —
  spot-checked in this phase's two new pages (aria-labels on icon-only buttons, native `<table>`/
  `<dl>` semantics) but not audited across the other ~27 pre-existing routes.
- Empty/loading/error state consistency check across all routes — this phase's two pages follow
  the "loading text / error text / empty-state message" three-state pattern already used
  elsewhere (e.g. `settings/teams`), but no systematic audit of every route for the same
  consistency has been done.

## Phase 14 — User, Team & Role Administration

Full admin suite over the RBAC scaffolding Phase 3 laid down (users/roles/permissions/teams
tables + policies + the basic `/settings/users` placeholder page).

### Backend (`backend/`)

- **`UserController::index`** now serves two shapes from one endpoint: the original minimal
  `{id, name, email}` directory (unchanged, used by every assignee/@mention picker) by default,
  and a fuller paginated admin listing (search/role filter/active filter, with roles/teams/
  last_login_at) when the caller passes any of `search`/`role_id`/`is_active`/`page`/`per_page`
  **and** holds `users.view` — callers without that permission always get the minimal shape
  regardless of query params, so nothing beyond the existing directory is exposed by accident.
- **`UserController::show`** (profile + last 20 audit-log rows as "recent activity", gated by the
  existing `UserPolicy::view` — `users.view` or self) and **`UserController::update`** (name/
  email/single-role reassignment/team-membership sync, gated by `UserPolicy::update` —
  `users.manage` or self) added. **`UserController::resendInvitation`** added (new
  `InvitationPolicy::resendInvitation`, gated `invitations.manage`; rejects non-pending
  invitations with a 422 rather than silently resending an already-accepted one).
- **`TeamController`** (new): full CRUD (`GET/POST /api/v1/teams`, `GET/PATCH/DELETE /{id}`) plus
  `POST /{id}/members` (add, with an `is_lead` flag doubling as the "designated team manager"
  field per pivot `team_user.is_lead`) and `DELETE /{id}/members/{userId}`. New `TeamPolicy`,
  gated `teams.view` (read) / `teams.manage` (write) per the matrix.
- **`RoleController`** (new): `GET /api/v1/roles` (with permission list + user count per role),
  `POST /` (create a custom role with an initial permission set), `PATCH /{id}` (rename/change
  description/replace permission set), `DELETE /{id}`. New `RolePolicy`, gated `roles.view` /
  `roles.manage`. **System-role protection**: the `Role.is_system` flag already existed from
  Phase 3's `RolePermissionSeeder` (no migration needed) — `RoleController::update`/`destroy`
  both hard-block (422, not silently ignored) renaming, permission changes, or deletion of any
  `is_system=true` role, even for a Super Admin, and `destroy` additionally 422s if a
  non-system role still has users assigned. `RolePolicy::delete` also checks `!is_system` as a
  second layer beneath the controller check.
- **`PermissionController::index`** (new): full permission catalog grouped by `permissions.group`,
  gated `roles.view`, backs the frontend's permission-matrix editor.
- **No permission-dependency/hierarchy rules implemented** — `docs/07-permission-matrix.md` does
  not specify any implied hierarchy (e.g. no stated rule that `deals.manage` requires
  `deals.view`, since the matrix uses one combined permission per resource, not separate
  view/edit strings), so none was invented.
- Registered `Gate::policy()` for `Team`/`Role`/`Invitation` in `AppServiceProvider` alongside
  the existing ones; the existing `Gate::before` super-admin bypass covers all three
  automatically.
- **Tests** (`tests/Feature/AdminSuiteTest.php`, 16 new, all passing): permission enforcement per
  endpoint per role (Agent/Manager/Administrator/Super Administrator) for users/teams/roles/
  permissions; the minimal-vs-admin user listing split proven both ways; team CRUD + member
  add/remove/manager-flag; role CRUD; **system roles proven un-deletable and un-editable even by
  Super Administrator**; a role still assigned to a user proven un-deletable; permission catalog
  gated and proven to contain all admin permissions; workspace isolation on teams (404 across
  workspaces, excluded from list). `php artisan test`: **163/163 passing** (147 pre-existing + 16
  new), no regressions.

### Frontend (`frontend/`)

- `/settings/users` replaced the Phase 3 placeholder with a real page: invite-user form (calls
  the existing `POST /auth/invitations`), searchable/paginated user table with inline
  name/role edit, suspend/reactivate toggle, resend-invitation button, and last-login column.
  All mutations go through new `src/lib/admin-api.ts` + `src/hooks/use-admin.ts`.
- New `/settings/teams`: team list, create/rename/delete, per-team member add/remove and a
  "Set as manager" toggle (maps to `team_user.is_lead`). Read-only for `teams.view`-only holders
  (Manager), fully editable for `teams.manage` holders (Administrator/Super Admin).
- New `/settings/roles`: role list-as-columns × permission-catalog-as-rows checkbox matrix
  (`GET /api/v1/permissions`, grouped by `group`). System roles' checkboxes are rendered
  **disabled** with a tooltip explaining why (mirrors the backend 422); custom roles are fully
  toggleable per-checkbox, each toggle immediately persisted via `PATCH /roles/{id}`. Create-role
  form for new custom roles; delete button (hidden for system roles).
- Sidebar: added "Teams" (`teams.view`) and "Roles & Permissions" (`roles.view`) entries,
  following the exact same permission-gating pattern as the existing admin entries.
- `npm run lint`: clean. `npm run build`: clean TypeScript + Turbopack build. Route list (27
  routes, +3 vs. Phase 13): all previous routes unchanged, plus `/settings/roles` (○) and
  `/settings/teams` (○); `/settings/users` still ○ (client-rendered, permission-gated at runtime
  as before).

### Known gaps / left for Phase 15

- Frontend `/settings/users` page-level gate is still `users.manage` only (matches the existing
  sidebar entry); a `users.view`-only Manager gets redirected to `/unauthorized` at the route
  level even though the backend would serve them a read listing. Not fixed here to avoid
  widening the page's write-affordances (suspend/edit buttons) without also re-deriving a
  read-only variant — flagged rather than silently left inconsistent.
- No client-side polling/toast when an invitation is actually accepted; admins only see the
  `is_active`/role state update on next manual refresh of the users table.

## Phase 15 — Workspace Settings & Audit Log Viewer (next steps)

- **Workspace settings UI**: `workspace.settings.manage` permission and (need to verify) a
  `WorkspaceSetting` model/table already exist per `docs/04-database-design.md` — no dedicated
  `/settings/workspace` page yet for business hours, branding, default pipeline, etc. Needs a
  backend `WorkspaceSettingController` audit first (may not exist at all — check before
  assuming Phase 3 built it).
- **Audit log viewer**: `audit_logs.view` permission and `AuditLog`/`AuditLogger` exist and have
  been used for every gated mutation since Phase 3 (now including everything added in this
  Phase 14 update) — no `AuditLogController` or frontend page renders them yet. Needs: a
  paginated/filterable (by actor/action/date range/subject type) backend endpoint gated
  `audit_logs.view`, and a `/settings/audit-log` page.
- Re-verify `/settings/whatsapp` against the roadmap's fuller "QR linking screen,
  reconnect/logout" description — it was built in an earlier phase but hasn't been re-audited
  against that specific requirement list.

## Phase 13 — Dashboard, Analytics & Reporting

Note on numbering: `docs/08-implementation-roadmap.md` calls this its own "Phase 14 —
Dashboard & Analytics" (its Phase 13 is global search/saved filters, already shipped in an
earlier pass — see the `/search` page and `SearchController` referenced below). This update
uses "Phase 13" to match the sequential count of what has actually been built so far in this
repo, not the roadmap doc's original numbering.

### Backend (`backend/`)

- **Two new permissions** not in the original `docs/07-permission-matrix.md` table:
  `analytics.view` (granted to Super Admin/Admin/Manager/Viewer, same roles as
  `dashboard.view_workspace`) and `analytics.export` (Super Admin/Admin/Manager only, same
  shape as `contacts.export`). Added to `PermissionSeeder`/`RolePermissionSeeder` with an
  inline comment explaining why they exist beyond the doc. `dashboard.view_workspace` (already
  in the matrix) gates the summary endpoint.
- **`GET /api/v1/dashboard/summary?from=&to=`** (`DashboardController::summary`, gated
  `dashboard.view_workspace`) — new/open/closed/unassigned conversation counts, average
  first-response/response time, new contacts, new leads + conversion rate, pipeline value, won
  value, lost count, overdue tasks, per-agent open-conversation/open-task workload. Cached 30s
  in Redis (`Cache::remember`, keyed by workspace+range) since it backs a live dashboard.
  Default range is the last 30 days if `from`/`to` are omitted.
- **Response-time metric is an explicit best-effort approximation**, documented in a
  docblock on `DashboardController::responseTimeAverages()`: there is no dedicated
  "conversation started"/"agent replied" event table, only the gateway-owned
  `messages.sent_at`+`direction` columns. Formula: walk each conversation's messages in
  chronological order; every inbound message immediately followed by an outbound message
  counts as one "response" (gap = outbound.sent_at − inbound.sent_at). `avg_first_response`
  averages only the first such gap per conversation; `avg_response` averages every gap.
  Conversations with no reply yet are excluded from both (not counted as a very long
  response), which is deliberate — that gap is already surfaced via
  `conversations.open`/`unassigned`. All other summary/analytics numbers (conversation counts,
  lead/deal/task counts and sums) are **exact** aggregate queries, not approximations.
- **`GET /api/v1/analytics/*`** (`AnalyticsController`, gated `analytics.view`, all accept
  `from`/`to`/`agent_user_id`/`pipeline_id` filters, each cached 30s): `conversation-volume`
  (daily new-conversation counts), `response-time-trend` (daily avg response minutes, same
  formula as above), `lead-funnel` (count per lead status), `pipeline-stage-distribution`
  (count+value per open-deal stage), `won-vs-lost` (daily won/lost deal count+value),
  `agent-performance` (conversations closed + tasks completed per agent in range),
  `task-completion-rate` (completed/total tasks created in range).
- **`POST /api/v1/reports/export`** (`ReportExportController::store`, gated
  `analytics.export`) — validates `type` (`contacts`/`leads`/`deals`/`tasks`) +
  optional `from`/`to`, dispatches `App\Jobs\GenerateReportExportJob` (implements
  `ShouldQueue`) and returns `202 {status: queued}` immediately, matching the spec's
  "background generation ... download notification" requirement. The job writes a CSV to the
  `local` disk under `exports/{workspace_id}/...` (not `public` — exports can contain PII like
  phone numbers/emails) and calls `NotificationService::notify()` with a new
  `report.export_ready` type (added to `AppNotificationMail`'s subject/body `match`) carrying
  the file path, reusing the exact same in-app+email+realtime pipeline built in Phase 12.
  **`GET /api/v1/reports/export/{notification}/download`** streams the file back, scoped to
  the requesting user's own notification (404s otherwise) — no separate permission needed
  since it's already user-scoped, same rationale as the Phase 12 notifications routes.
  `QUEUE_CONNECTION=sync` in this dev/test environment means the job runs inline; the
  structure (a real `ShouldQueue` job class) is unchanged for a `redis` queue in
  staging/production — **only inline/sync execution was verified, never a real worker
  processing a queued job asynchronously.**
- **Tests** (`tests/Feature/DashboardAnalyticsTest.php`, 8 new tests, all passing):
  permission enforcement on all three gates (`dashboard.view_workspace`/`analytics.view`/
  `analytics.export`) across roles; summary numbers asserted **exactly** against known
  fixture data (3 conversations in 3 states, 3 leads in 3 statuses, 3 deals in 3
  states/values, 2 tasks) including the exact conversion-rate percentage and per-agent
  workload counts; response-time averages asserted exactly against hand-placed message
  timestamps (10-minute gaps); date-range and agent filters proven to narrow results; export
  job proven to write a real file and a real `report.export_ready` notification, and the
  download endpoint proven to stream it back. `php artisan test`: **147/147 passing** (139
  pre-existing + 8 new), no regressions.
- **Not tested against production-scale data volumes**: like `SearchController` before it
  (Phase 13/search), the response-time computation and CSV export both load full message/row
  sets into PHP rather than using SQL window functions or streaming exports — fine at the data
  volumes exercised here, unverified at real production scale. Flagged, not silently accepted.

### Frontend (`frontend/`)

- Replaced the `/dashboard` placeholder with a real dashboard (`src/app/(dashboard)/dashboard/page.tsx`,
  gated by `<RequirePermission permission="dashboard.view_workspace">`): 9 metric cards from
  `/dashboard/summary`, plus Recharts panels for all 7 analytics series (conversation volume —
  bar, response-time trend — line, lead funnel — horizontal bar, pipeline stage distribution —
  pie, won-vs-lost — area, agent performance — grouped bar, task completion rate — text stat),
  all wired through TanStack Query hooks (`src/hooks/use-analytics.ts`) and
  `src/lib/analytics-api.ts`.
- **Loading skeletons** (animated placeholder blocks) per card/chart while a query is
  in-flight, and explicit **empty states** ("No X yet for this period") when a series has no
  non-zero data points — no chart ever renders fabricated/sample data for a fresh workspace.
- **Filters**: date-range (`from`/`to` date inputs, default last 30 days) applied to every
  query; an agent selector (only rendered if the user holds `users.view`, since `/users` is
  itself permission-gated and Viewer doesn't hold it) feeding `agent_user_id` on the
  agent/pipeline-scoped endpoints.
- **Export section**: one button per report type (contacts/leads/deals/tasks), each rendered
  only if the user holds `analytics.export` (`usePermission` hook), showing
  Generating.../Queued/Failed transient states after calling `POST /reports/export` — no
  polling implemented client-side; completion surfaces via the existing notification bell
  (Phase 12), consistent with the backend's async design.
- **Chart colors**: used the dataviz skill's validated 6-slot categorical palette (light+dark
  steps as CSS custom properties `--chart-series-1..6` added to `globals.css`, following the
  existing `--color-*` token pattern), never a cycled/generated hue.
- `npm run lint`: clean, zero warnings. `npm run build`: clean TypeScript + Turbopack build.
  Route list (24 routes, unchanged except `/dashboard` now dynamic content, still statically
  prerendered as `○`): `/`, `/_not-found`, `/accept-invitation`, `/calendar`, `/contacts`,
  `/contacts/[id]` (ƒ), `/contacts/new`, `/dashboard`, `/deals/[id]` (ƒ), `/forgot-password`,
  `/inbox`, `/inbox/[conversationId]` (ƒ), `/leads`, `/leads/[id]` (ƒ), `/login`, `/pipeline`,
  `/reset-password`, `/search`, `/settings/labels`, `/settings/notifications`,
  `/settings/pipelines`, `/settings/users`, `/settings/whatsapp`, `/tasks`, `/tasks/[id]` (ƒ),
  `/unauthorized`.

## Phase 14 — Admin Suite (next steps)

Roadmap's Phase 15 ("User/team/role admin UI, invitations UI, workspace settings UI, WhatsApp
connection management UI, audit log viewer") — called Phase 14 here to match this doc's
sequential count. Phase 3 already built the backend RBAC (roles/permissions/policies) and a
**basic** `/settings/users` page (list only, per the frontend route map). Still needed:

- Full user admin UI: invite flow (the backend `POST /api/v1/auth/invitations` already
  exists from Phase 3/9 — needs a frontend form), suspend/reactivate a user, resend
  invitation, role assignment UI per user.
- Team management UI: create/edit teams, add/remove members — backend `teams.manage`/
  `teams.view` permissions and (need to verify) `TeamController` routes already exist from
  Phase 3; no frontend page yet beyond what's listed above.
- Role/permission-matrix editor: a UI over `roles.manage`/`roles.view` letting an admin see
  and toggle each permission per custom role (system roles' permissions should likely stay
  read-only/protected, per `RolePermissionSeeder`'s `is_system` flag — needs a product
  decision on whether system roles are editable at all before building the toggle UI).
- Audit log viewer: `audit_logs.view` permission and `AuditLog`/`AuditLogger` already exist
  (used across Phases 3-12 for every gated mutation) — no frontend page renders them yet.
- Workspace connection management UI beyond the existing `/settings/whatsapp` page should be
  re-verified against the roadmap's fuller "QR linking screen, reconnect/logout" description.

## Phase 12 — Notifications

### Backend (`backend/`)

Extended the Phase 10 minimal `NotificationService`/`SendTaskReminders` into the full
notification system:

- **`NotificationService::notify()`** (`app/Services/NotificationService.php`) is now the
  single choke point every trigger goes through. Per call it: (1) checks
  `notification_preferences` for that `(user, type)` pair, defaulting to
  `in_app_enabled=true`/`email_enabled=false` when the user has never saved one (matches the
  migration's column defaults); (2) writes the `notifications` row only if in-app is enabled,
  returning `null` otherwise (verified by `test_in_app_preference_off_suppresses_the_notification_row`);
  (3) relays a `notification.created` event to the gateway if a row was written; (4) queues
  `App\Notifications\AppNotificationMail` (a generic `Illuminate\Notifications\Notification`,
  `implements ShouldQueue`, one class handling every type's subject/body via a `match`) if the
  email preference is on **and** `NotificationService::mailConfigured()` says SMTP looks real
  (`mail.default` isn't `log`/`array`/null and that mailer has a `host` configured, `ses`
  exempted). In this environment `MAIL_MAILER=array` (see `phpunit.xml`), so
  `mailConfigured()` is false and no email is ever queued in the test run - **only the
  code path and `Notification::fake()`-verified queuing were checked
  (`test_email_preference_on_queues_the_mailable_when_mail_is_configured`), never real SMTP
  delivery.** No SMTP credentials exist in this environment.
- **Real trigger points wired** (not just unused service methods):
  - `task.assigned` (`TaskController::store`/`update`, pre-existing), `task.reminder`
    (`SendTaskReminders`, pre-existing), `task.comment_mention` (`TaskController::storeComment`,
    pre-existing), `note.mention` (`InternalNoteController`, pre-existing) - all now flow
    through the extended `notify()` so they get preference-checking/realtime/email for free.
  - `conversation.assigned` (**new**) - `ConversationController::assign()` now notifies the
    newly assigned user (skipped if self-assigning).
  - `task.overdue` (**new**) - new command `App\Console\Commands\NotifyOverdueTasks`
    (`php artisan tasks:notify-overdue`). No `overdue_notified_at` column exists on `tasks`,
    so idempotency (never notify the same overdue task twice) is checked against the
    `notifications` table itself (`whereJsonContains('data->task_id', ...)`) - the same
    pattern used below, chosen over a schema change for an add-on trigger.
  - `conversation.new_message` (**new**) - new command
    `App\Console\Commands\NotifyNewMessagesOnAssignedConversations`
    (`php artisan conversations:notify-new-messages`). `messages` is gateway-owned
    (docs/DATA_OWNERSHIP.md) and the backend has no webhook/event hook for "a message just
    arrived" - it only ever learns about new rows by reading the shared table, so (like
    `SendTaskReminders`) this is a poll, not an inline controller hook. Only the latest
    inbound message per assigned conversation is considered per run; idempotency again via a
    `notifications` lookup by `data->message_id`.
  - `whatsapp.connection.failed` / `whatsapp.connection.reauth_required` (**new**) - new
    command `App\Console\Commands\NotifyWhatsappConnectionEvents`
    (`php artisan whatsapp:notify-connection-events`). Polls the gateway-owned, read-only
    `whatsapp_connection_events` table (backend never writes it) for `disconnected` ->
    `whatsapp.connection.failed` and `logged_out` -> `whatsapp.connection.reauth_required`,
    notifying every workspace user who holds `whatsapp.connection.manage` (the same
    permission gating the connection settings page). Idempotent via a `notifications` lookup
    by `data->connection_event_id`.
  - `invitation.created` was **already** notifying (via email only, correctly - the invitee
    isn't a `User` row yet so an in-app notification has no recipient) through
    `AuthController::invite()` -> `Invitation::notify(new InvitationNotification(...))`,
    pre-existing from Phase 3/9. Left as-is; not migrated onto `NotificationService` since it
    isn't an in-app-notification-table trigger at all.
  - **None of the three new commands are wired into a scheduler** (`routes/console.php`/
    `bootstrap/app.php` have no `Schedule::` calls anywhere in this repo, including for the
    pre-existing `SendTaskReminders` - scheduling is left as an explicit, pre-existing gap for
    ops/Phase 13, not newly introduced here).
- **API** (`routes/api.php`, ungated by permission - a notification/preference is always
  scoped to the requesting user, see below):
  - `GET /api/v1/notifications?unread=1&page=&per_page=` - unread-first ordering
    (`ORDER BY read_at IS NOT NULL, created_at DESC`), `meta.unread_count` always included.
  - `PATCH /api/v1/notifications/{id}/read`, `POST /api/v1/notifications/mark-all-read`.
  - `GET /api/v1/notification-preferences` - one row per known trigger type, defaulting
    unset types so the settings page always has something to render a toggle for.
  - `PATCH /api/v1/notification-preferences` - upserts by `(user_id, notification_type)`.
- **Isolation**: `Notification` already had `BelongsToWorkspace`, so a foreign-workspace id
  404s at route-model-binding time before the controller runs; `NotificationController`
  additionally scopes every query to `user_id = $request->user()->id` and 404s
  `markRead`/list access to another user's own-workspace notification - a notification is
  private to one user, not workspace-shared (verified by
  `test_user_never_sees_or_marks_another_users_notification` and
  `test_notification_is_workspace_scoped`). `notification_preferences` has no `workspace_id`
  column at all (correct - it's a personal setting), isolated by `user_id` alone.
- **Realtime** (`docs/EVENT_CATALOG.md` `notification.created`): reused the existing
  `GatewayClient::emitEvent` / gateway `/internal/whatsapp/events/emit` relay pattern from
  Phase 6/7 rather than standing up a second Socket.IO namespace. Added
  `GatewayClient::notifyUser()` (new) and extended the gateway's `events/emit` endpoint
  (`whatsapp-gateway/src/routes/internal-whatsapp.routes.ts`) with a `notification.created`
  branch requiring `userId`, delivered via new `emitNotificationCreated()`
  (`whatsapp-gateway/src/lib/socket-server.ts`) to room `workspace:{workspaceId}:user:{userId}`
  under the pre-existing `/gateway` namespace - **one documented deviation** from
  `docs/EVENT_CATALOG.md`'s literal `/crm` namespace: reusing the already-wired `/gateway`
  namespace (which the frontend already connects to) was judged the lower-risk choice over
  standing up and testing a second Socket.IO namespace end-to-end in this session. The room
  convention (`workspace:{id}:user:{id}`) matches the doc and what `emitMessageFailed`
  already joins clients into.
- **Tests**: `tests/Feature/NotificationTest.php` (12 tests) - trigger creation
  (conversation assignment, task assignment), unread listing/mark-read/mark-all-read,
  user- and workspace-isolation, in-app preference suppression, email preference queuing
  (`Notification::fake()`, asserts queued not delivered) and its inverse when mail isn't
  configured, preferences index defaults + update, and one test per new polling command
  (overdue tasks, new messages, WhatsApp connection events) including a re-run-is-idempotent
  assertion for each. **`php artisan test`: 139 passed (464 assertions)**, up from 127 -
  no regressions in the pre-existing 127.

### Gateway (`whatsapp-gateway/`)

- `emitNotificationCreated(workspaceId, userId, payload)` (new, `src/lib/socket-server.ts`)
  and a `notification.created` branch in `POST /internal/whatsapp/events/emit`
  (`src/routes/internal-whatsapp.routes.ts`), requiring `userId` and rejecting with 400
  without it.
- Extended `src/routes/internal-whatsapp.media-and-events.test.ts` with 2 new tests (relay to
  the user room, reject without `userId`).
- **`npm run build`**: clean. **`npx vitest run`**: 27 passed, 1 failed (28 total, up from
  26) - the 1 failure is `connection-manager.test.ts > persists and emits on QR event`, a
  **pre-existing flake** unrelated to this change: it fails only when the full suite runs
  together (timing/ordering-sensitive) and passes every time when run in isolation
  (`npx vitest run src/whatsapp/connection-manager.test.ts` -> 5/5 green). Verified by
  running it standalone before and after this change with identical results - not caused by
  the Phase 12 edits, which touched only `socket-server.ts` and
  `internal-whatsapp.routes.ts`.

### Frontend (`frontend/`)

- **`src/lib/notifications-api.ts`** (new) - typed client for all four endpoints plus
  `notificationLinkFor()` (maps a notification's type/data to the entity route - e.g.
  `conversation.assigned` -> `/inbox/{conversation_id}`, `whatsapp.connection.failed` ->
  `/settings/whatsapp`) and a `NOTIFICATION_TYPE_LABELS` map shared by the bell and the
  preferences page.
- **`src/hooks/use-notifications.ts`** (new) - `useNotifications(enabled)`: fetches recent
  notifications + unread count, joins the `workspace:{id}:user:{id}` Socket.IO room and
  invalidates on `notification.created` (matching `use-whatsapp-connection.ts`'s pattern),
  with the same "poll only when the socket isn't connected" fallback (15s vs. 60s).
- **`src/components/layout/notification-bell.tsx`** (new) - replaces the inert `Bell` button
  that already existed in the topnav placeholder; unread-count badge, click-outside-closes
  dropdown, "Mark all read", clicking a notification marks it read and navigates via
  `notificationLinkFor`. Wired into `src/components/layout/topnav.tsx` alongside the existing
  `GlobalSearchBar`/`WhatsappStatusIndicator`.
- **`src/app/(dashboard)/settings/notifications/page.tsx`** (new) - per-type in-app/email
  toggle grid, optimistic updates via React Query, wired to the real preferences API. Not
  wrapped in `RequirePermission` (unlike the other `/settings/*` pages) because the backend
  route has no permission gate - every authenticated user manages only their own preferences.
  Added to the sidebar (`src/components/layout/sidebar.tsx`) as an ungated nav item, since
  it's personal settings, not an admin capability.
- **`npm run lint`**: clean, zero warnings. **`npm run build`**: clean;
  `/settings/notifications` appears in the static route list alongside the other 22
  pre-existing routes (`/`, `/login`, `/dashboard`, `/inbox`, `/inbox/[conversationId]`,
  `/contacts`, `/contacts/[id]`, `/contacts/new`, `/leads`, `/leads/[id]`, `/pipeline`,
  `/deals/[id]`, `/tasks`, `/tasks/[id]`, `/calendar`, `/search`, `/settings/labels`,
  `/settings/pipelines`, `/settings/users`, `/settings/whatsapp`, `/unauthorized`,
  `/accept-invitation`, `/forgot-password`, `/reset-password`).

### Honest limitations / follow-ups

- No real SMTP delivery was tested anywhere in this pass - only queued-job creation
  (`Notification::fake()` + `assertSentTo`) and the `mailConfigured()` gating logic.
- The three new polling commands are not registered on any Laravel scheduler (matching the
  pre-existing, unscheduled `SendTaskReminders`) - running them (and the pre-existing
  reminder command) periodically via `Schedule::command(...)->everyMinute()` or an external
  cron is an open item, ideally picked up alongside Phase 13's operational concerns.
- `notification.created` is delivered over the `/gateway` Socket.IO namespace, not the `/crm`
  namespace `docs/EVENT_CATALOG.md` literally specifies - a deliberate, documented reuse of
  already-wired infrastructure rather than a doc-following-to-the-letter rebuild; worth a
  follow-up doc correction or a real `/crm` namespace if that separation turns out to matter
  later (e.g. different auth/rate-limit rules for notification sockets).

## Phase 13 next steps — Dashboard, Analytics, and Reporting

Per `docs/08-implementation-roadmap.md`, Phase 13 covers:

- **Dashboard** (`/dashboard`, currently a placeholder): real KPI tiles (open conversations,
  unread count, tasks due today/overdue, deals by stage, win rate) backed by real aggregate
  queries, not the search/notification per-entity endpoints reused ad hoc.
- **Analytics** (`/analytics`, currently a placeholder): conversation volume over time,
  response-time metrics (first-response, resolution time - check whether `message_status_events`/
  `conversations` carry enough timestamps already, or whether a new aggregate table/materialized
  view is needed), agent workload/performance, pipeline conversion funnel.
- **Reporting**: exportable reports (CSV/PDF?) - check `docs/05-api-contract.md` and
  `docs/08-implementation-roadmap.md` for the exact spec before building; `ContactController`
  already has an `export` action (CSV) worth reusing the pattern from.
- Also worth doing early in Phase 13: register `SendTaskReminders`, `NotifyOverdueTasks`,
  `NotifyNewMessagesOnAssignedConversations`, and `NotifyWhatsappConnectionEvents` on a real
  Laravel schedule (`bootstrap/app.php`'s `withSchedule()` or `routes/console.php`) - this is
  a small, contained task and was called out above as unfinished from Phase 12, not deferred
  for architectural reasons.

## Phase 11 — Labels, Search, and Segmentation

### Backend (`backend/`)

The `labels`/`contact_label`/`conversation_label`/`lead_label`/`deal_label` tables and the
`Label` model's four `belongsToMany` relations (and the corresponding `labels()` relation on
`Contact`/`Lead`/`Deal`/`Conversation`) already existed from Phase 2 scaffolding, unused by any
controller. This pass added:

- **`LabelController`** (`app/Http/Controllers/Api/V1/LabelController.php`) —
  `GET/POST /api/v1/labels`, `PATCH/DELETE /labels/{id}`. Listing is open to any authenticated
  workspace user (needed to render filter chips and attach controls); create/update/delete are
  gated on `labels.manage` via a new **`LabelPolicy`** (registered in `AppServiceProvider`).
  Deleting a label does **not** manually detach it from every entity first — every pivot
  table's `label_id` column was already declared `->cascadeOnDelete()` in the Phase 2 migration
  (`2026_07_31_080039_create_label_pivot_tables.php`), so the database itself removes every
  pivot row referencing the label as part of the same `DELETE`. Verified with a dedicated test
  (`LabelTest::test_deleting_label_cascades_pivot_rows_without_orphans`) that the label row, the
  pivot rows, and the parent record's row (e.g. the contact) all end up in the correct state —
  no orphans, no accidental cascade onto the contact/lead/deal/conversation itself.
- **Label association endpoints**, one pair per entity type (not a generic polymorphic
  endpoint — the schema uses four separate, non-polymorphic pivot tables per
  `docs/04-database-design.md`, so a generic endpoint would have meant redesigning the schema
  rather than following it): `POST/DELETE /api/v1/contacts/{id}/labels/{labelId}`,
  `/leads/{id}/labels/{labelId}`, `/deals/{id}/labels/{labelId}`,
  `/conversations/{id}/labels/{labelId}`. Each is authorized against that entity's existing edit
  policy (`update` for Contact/Lead/Deal, `reply` for Conversation, since conversations have no
  generic "update" policy method) — attaching a label to a record requires being able to edit
  that record, which is a different (and generally broader) permission than `labels.manage`
  itself (`labels.manage` gates managing the *label catalog* — creating/renaming/recoloring/
  deleting labels — not tagging individual records with existing labels).
- **Multi-label filtering**: `GET /contacts`, `/leads`, `/deals`, and `/conversations` now
  accept a `labels[]` query param, matched with **any-match (OR)** semantics via
  `whereHas('labels', fn ($q) => $q->whereIn('labels.id', $ids))` — chosen over strict AND
  because "show me everything tagged VIP or Hot Lead" is the more common CRM filtering pattern
  than requiring every selected label to match simultaneously. Conversations keep their
  pre-existing single-name `label=` filter alongside the new `labels[]=` id-based one for
  backward compatibility.
- **`SearchController`** (`app/Http/Controllers/Api/V1/SearchController.php`) —
  `GET /api/v1/search?q=&category=&page=&per_page=`, gated on `search.global` (seeded to every
  role). Two response shapes: no `category` param returns an omnibar-style breakdown (up to 5
  items per permitted category plus each category's total count); a `category` param returns
  that one category fully paginated. **Permission-aware per category**, not just at the route
  level: the controller narrows which of contacts/conversations/leads/deals/tasks it queries
  based on the requesting user's actual permissions (`contacts.view` / `conversations.view` /
  `leads.manage` / `deals.manage` / `tasks.manage`-or-`tasks.view_team`) — a user lacking
  `leads.manage` never sees a `leads` key in the response at all, verified by
  `SearchTest::test_search_excludes_categories_user_lacks_permission_for`. **Workspace
  isolation is automatic**, not manually coded: every model queried (`Contact`, `Conversation`,
  `Lead`, `Deal`, `Task`, and the gateway-owned `Message` used only for a read-only join/
  `whereHas` inside the conversations query) already uses the `BelongsToWorkspace` global
  scope, so cross-workspace rows are filtered out at the query layer without any extra code
  here — verified by `SearchTest::test_search_is_workspace_scoped`. The conversations search
  reads `messages.body` (a gateway-owned table per `docs/DATA_OWNERSHIP.md`) but only ever
  reads it via `whereHas` — nothing in this endpoint writes to it, preserving the
  backend/gateway data-ownership boundary.
  - **Matching strategy — a deliberate, documented tradeoff**: matches use plain
    `LIKE '%term%'` against existing columns, not MySQL FULLTEXT indexes. This repo has no
    confirmed local MySQL full-text configuration (minimum word length, stopword list, ngram
    parser) to validate a FULLTEXT migration against in this session, and shipping one
    unverified would be guessing rather than engineering. LIKE is correct today and matches the
    codebase's existing `ContactController::index` search filter, but a leading wildcard defeats
    a btree index, so it will not scale well to a large `messages` table. This is exactly the
    tradeoff flagged in `docs/08-implementation-roadmap.md` Phase 13 ("full-text/OpenSearch
    later") — left as a known, explicit follow-up rather than a silent gap.
- Eager-loaded `labels` onto `LeadController`/`DealController`'s `index`/`show` responses
  (they already had the `labels()` relation from Phase 2 but nothing loaded it, so the API
  never actually returned a lead's or deal's labels before this pass; `Contact`/`Conversation`
  controllers already loaded it).
- New `LabelPolicy`, `LabelFactory` (`Label` model gained the `HasFactory` trait, like the
  Phase 9/10 models before their fix).
- **Tests**: `tests/Feature/LabelTest.php` (9 tests — permission enforcement on label
  create/update/delete, open listing for any authenticated user, cascade-on-delete
  verification, attach/detach permission enforcement and effect, multi-label any-match
  filtering on contacts/leads/deals), `tests/Feature/SearchTest.php` (6 tests — cross-category
  breakdown correctness, per-category permission exclusion, workspace isolation, paginated
  single-category mode, category-permission rejection, empty-query handling).

**Verified:** `php artisan test` → **127/127 passed** (up from 112 — all prior tests still pass
unmodified, plus 15 new tests across the two new suites).

### Frontend (`frontend/`)

- **`src/lib/labels-api.ts`**, **`src/hooks/use-labels.ts`** — typed client + React Query hooks
  for the label catalog CRUD and the four attach/detach endpoint pairs
  (`useEntityLabels(entity, id)` returns `{ attach, detach }` mutations that invalidate that
  entity's list/detail query-key prefix on success, refreshing badges immediately).
- **`src/lib/search-api.ts`**, **`src/hooks/use-search.ts`** — typed client for both search
  response shapes (breakdown vs. single-category-paginated) plus a small `useDebouncedValue`
  hook (300ms) so the omnibar doesn't fire a request per keystroke.
- **`src/components/labels/`**: `label-badge.tsx` (color-hex-tinted pill, optional remove
  button), `label-picker.tsx` (attach/detach control — shows current labels as removable
  badges plus a dropdown of the remaining workspace labels to add; `canEdit` prop hides the
  add/remove affordances entirely for users without edit rights on that record, mirroring the
  backend's per-entity policy gate), `label-filter-chips.tsx` (multi-select filter chips with
  any-match/OR semantics, matching the backend's `labels[]` filter contract, plus a "Clear"
  action).
- **Labels management UI**: `/settings/labels` (gated on `labels.manage`, hidden from the
  sidebar and redirected server-side-enforced otherwise) — create with a swatch-plus-native
  color-input picker, inline rename/recolor, delete with a confirm prompt that explicitly warns
  it detaches the label from every record.
- **Label badges + assign controls wired onto existing screens**: `/contacts` and `/leads` list
  pages gained a `Labels` column (badges) and a `LabelFilterChips` row wired to the list
  query's new `labels` filter; the `/contacts/[id]`, `/leads/[id]`, and `/deals/[id]` detail
  pages gained a "Labels" section using `LabelPicker`; the inbox's
  `contact-context-panel.tsx` had its previously read-only, "no endpoint yet" label list
  replaced with a live `LabelPicker` gated on `conversations.reply`. The pipeline board
  (`/pipeline`) was **not** wired for label filtering/display in this pass — its `board()`
  backend endpoint is a separate stage-grouped aggregation query from the plain `deals` index
  and doesn't currently eager-load `labels`; the `deals` list endpoint itself does support
  `labels[]` filtering and `Deal.labels` is already returned/typed, so this is a small, scoped
  follow-up rather than a missing capability.
- **Global search bar**: `src/components/search/global-search-bar.tsx`, mounted in
  `components/layout/topnav.tsx` — present on every authenticated page, since `topnav.tsx` is
  rendered once by the shared `(dashboard)/layout.tsx` wrapping all authenticated routes, not
  per-page. Debounced input, a grouped-by-category dropdown (up to 5 results per category with
  a "See all N results" link), a highlighted-match renderer
  (`components/search/highlight-match.tsx`), explicit empty and loading states, and
  Enter-to-navigate to a full `/search?q=` results page. The **`/search` page**
  (`app/(dashboard)/search/page.tsx`) offers an "All categories" breakdown view plus one fully
  paginated view per category (category pill tabs double as the "see all" destination).
- Fixed a field-name mismatch caught while wiring this up: `LabelSummary.color` (in
  `conversations-api.ts`, used nowhere yet) didn't match the backend's actual JSON key
  `color_hex` — corrected before anything shipped against the wrong field.
- Added `labels: LabelSummary[]` to the `Lead` and `Deal` frontend types (previously absent -
  the backend controllers didn't eager-load the relation either, see above) and a `labels`
  filter field to `ContactFilters`/`LeadFilters`/`DealFilters`.

**Verified:** `npm run lint` → clean (fixed one `react/no-unescaped-entities` error on the new
labels settings page). `npm run build` → clean; new routes `/search` and `/settings/labels`
appear in the route list alongside all prior routes (`/`, `/contacts`, `/contacts/[id]`,
`/contacts/new`, `/dashboard`, `/deals/[id]`, `/inbox`, `/inbox/[conversationId]`, `/leads`,
`/leads/[id]`, `/pipeline`, `/settings/labels`, `/settings/pipelines`, `/settings/users`,
`/settings/whatsapp`, `/tasks`, `/tasks/[id]`, `/calendar`, plus the `(auth)` routes).

### Next: Phase 12 — Notifications System

The minimal `NotificationService` from Phase 10 (writer for `task.assigned`/`task.reminder`/
`task.comment_mention`/`note.mention` only, no read path beyond raw DB rows) needs to grow into
the full spec:
- An in-app notification center (bell icon in the topnav currently renders a static, inert
  `Bell` button with no dropdown/list/count — that's the obvious next wiring point given this
  phase already touched `topnav.tsx`).
- `GET /api/v1/notifications`, mark read/unread (single + bulk), unread count endpoint.
- Notification preferences (per-type opt in/out, respecting `notifications.manage_own`).
- More trigger types beyond the four Phase 10 shipped — e.g. `lead.assigned`, `deal.stage_changed`,
  `conversation.assigned`, mentions in more places.
- An email delivery adapter (the service only writes DB rows today; no outbound channel
  exists yet).
- Wire `tasks:send-reminders` (Phase 10, currently a standalone Artisan command) into a real
  scheduler now that Phase 12 is explicitly about notification infrastructure.

## Phase 10 — Tasks, Calendar, and Internal Collaboration

### Backend (`backend/`)

`Task`/`TaskComment`/`TaskReminder`/`InternalNote`/`NoteMention` models and their tables already
existed from Phase 2 scaffolding (as did `TaskPolicy`, already registered in `AppServiceProvider`),
but had no controllers/routes/tests. This pass added:

- **`TaskController`** (`app/Http/Controllers/Api/V1/TaskController.php`) — `GET/POST /tasks`,
  `GET/PATCH/DELETE /tasks/{id}`, `POST /tasks/{id}/complete`, `POST /tasks/{id}/reopen`,
  `GET/POST /tasks/{id}/comments`. Filters: `mine`/default (assignee or creator is the caller),
  `team` (requires `tasks.view_team` — all workspace tasks; must be requested explicitly, since
  Agents also hold `tasks.view_team` per the seeded matrix and the default list view must still
  be "my tasks"), `overdue`, `upcoming` (due within 7 days), `completed`, `status`, `priority`,
  and link filters (`contact_id`/`lead_id`/`deal_id`/`conversation_id`/`assignee_id`). Tasks are
  linkable to a contact/lead/deal/conversation at creation. An optional `reminder_at` on create
  writes a `task_reminders` row.
- Fixed a latent bug found in the existing `TaskPolicy::update()`: it granted edit rights to
  anyone holding `tasks.view_team`, but per `docs/07-permission-matrix.md` that permission only
  broadens *visibility* — edit/delete stays scoped to `tasks.manage`'s "Own" semantics (assignee,
  creator, or a `users.manage`/`roles.manage` holder).
- Task comments: `@handle` mentions are parsed from the comment body and matched against
  workspace users' email local-part (no dedicated mention table exists for `task_comments` in
  the schema, unlike `internal_notes`/`note_mentions`, so matches are notified directly rather
  than persisted as rows).
- **`NotificationService`** (`app/Services/NotificationService.php`) — minimal writer for the
  existing `notifications` table (model existed from Phase 2, no write path yet). Scoped
  intentionally to what Tasks/Notes need (`task.assigned`, `task.reminder`,
  `task.comment_mention`, `note.mention`); full notification delivery/preferences remain Phase 12.
- **`php artisan tasks:send-reminders`** (`app/Console/Commands/SendTaskReminders.php`) — finds
  `task_reminders` rows with `remind_at <= now()` and `sent_at IS NULL`, creates a
  `task.reminder` notification for the task's assignee, and stamps `sent_at` (idempotent — a
  second run does not re-notify). Intended to be wired to the scheduler once Phase 12 sets one up;
  runs standalone via Artisan/cron until then.
- **`InternalNoteController`** (`app/Http/Controllers/Api/V1/InternalNoteController.php`) —
  `GET/POST /notes`, `PATCH/DELETE /notes/{id}`. `internal_notes` links via explicit nullable FKs
  (conversation/contact/deal), not a morph column, per the existing schema — a note must specify
  at least one. Create is gated on `notes.create`; update/delete requires the note's author or
  `notes.manage_any`. Listing hides `is_private` notes from non-authors unless the caller holds
  `notes.view_private`. `@handle` mentions in the body create real `note_mentions` rows (the
  schema already has this table) plus a `note.mention` notification.
- **`GET /api/v1/users`** (added to the existing `UserController`) — a minimal workspace-scoped
  user directory (id/name/email, active only). This didn't exist anywhere yet; Tasks' assignee
  picker and both Tasks'/Notes' @mention matching need *some* user list, and gating it behind
  `users.manage` would have blocked every Agent from assigning/mentioning teammates, so it's open
  to any authenticated active user. Full admin user-management CRUD is unrelated and stays gated
  as before.
- Audit log entries: `task.created/updated/assigned/completed/reopened/deleted/comment_created`,
  `note.created/updated/deleted`.
- Fixed a pre-existing bug surfaced by testing `TaskController`: `$this->authorize()` throwing
  `AuthorizationException` was never reaching the app's custom JSON-envelope renderable in
  `bootstrap/app.php`, because Laravel's base exception handler converts it to
  `AccessDeniedHttpException` *before* renderable callbacks run — invisible until now because
  every controller so far (`Lead`/`Deal`/`Pipeline`) also had a route-level `permission:` middleware
  that intercepted the 403 first. Added a render callback for `AccessDeniedHttpException` in
  `bootstrap/app.php` so any controller relying solely on policy `authorize()` calls (as
  `TaskController` does, since task permission scoping is per-record, not a flat route gate) gets
  the same `{success:false,...}` envelope.
- `HasFactory` added to `Task`/`InternalNote` (missing, like the Phase 9 models before their
  fix), plus new `TaskFactory`/`InternalNoteFactory`.
- Routes: `routes/api.php`, new `tasks` and `notes` groups, `GET /users`.
- **Tests**: `tests/Feature/TaskTest.php` (11 tests — permission enforcement, workspace
  isolation, default "mine" scoping vs explicit `team`, overdue/upcoming filters, create linked
  to a lead, complete/reopen transitions, non-owner update rejection, comment creation + mention
  notification, reminder command sends once and skips future/already-sent reminders),
  `tests/Feature/InternalNoteTest.php` (8 tests — create permission, link-required validation,
  mention creates `note_mentions` row + notification, author vs non-author update/delete rules,
  `notes.manage_any` override, private-note visibility filtering).

**Verified:** `php artisan test` → **112/112 passed** (up from 93 — all prior tests still pass
unmodified, plus 19 new tests across the two new suites).

### Frontend (`frontend/`)

- **`src/lib/tasks-api.ts`**, **`notes-api.ts`**, **`users-api.ts`** — typed clients following
  the existing envelope-unwrapping conventions; **`src/hooks/use-tasks.ts`**, **`use-notes.ts`**,
  **`use-users.ts`** — React Query hooks.
- **Routes**: `/tasks` (filter chips for My tasks/Team [only shown if `tasks.view_team`]/
  Overdue/Upcoming/Completed, status/priority selects, inline create-task form assignable to a
  user with an optional due date/priority/reminder), `/tasks/[id]` (detail view — inline
  assignee/priority editing, complete/reopen, delete, linked-record summary, comments list +
  add-comment box with a plain-text `@name` mention convention), `/calendar` (a custom month-grid
  component — no calendar library added; each day cell lists up to 3 due tasks as colored-dot
  chips linking to `/tasks/[id]`, with an overflow "+N more" count; team-tasks scope is used only
  when the viewer holds `tasks.view_team`, otherwise falls back to their own tasks).
- **Inbox note mode**: `src/components/inbox/chat-panel.tsx`'s composer now has a "Reply to
  customer" / "Internal note" toggle (only shown when the user holds both `conversations.reply`
  and `notes.create`; users with only one permission get that mode without the toggle). Note mode
  switches the composer to an amber/tinted color scheme (border, background, textarea, send
  button) distinct from the normal blue reply composer, and a banner above the input says the
  note won't be sent to the customer. Existing internal notes for the open conversation render
  above the composer in an amber-tinted note list, clearly separated from the WhatsApp message
  thread above it.
- **Sidebar**: "Tasks" and "Calendar" entries added, both gated on `tasks.manage` (the permission
  that gates the routes themselves via `RequirePermission`).
- **Verified**: `npm run lint` → 0 errors, 0 warnings. `npm run build` → compiles clean; route
  list includes the new `○ /calendar`, `○ /tasks`, `ƒ /tasks/[id]` alongside all prior routes.

### Known gaps / deferred

- Task comment `@mentions` and note `@mentions` use simple text matching (no live autocomplete
  dropdown) — functional per the phase brief's "keep it functional, not fancy" scope, not a
  polished mention-picker UI.
- `tasks:send-reminders` has no scheduler wiring yet (no `routes/console.php` schedule entry) —
  it must be invoked manually or via external cron until Phase 12 sets up the scheduler generally.
- Notes UI only covers conversations in the chat-panel; a dedicated Notes section on lead/deal
  detail pages was not added in this pass (the `/notes` API supports `contact_id`/`deal_id`
  equally, so this is additive, not a schema gap).

## Phase 9 — Leads, Deals, and Configurable Pipelines

### Backend (`backend/`)

The `pipelines`, `pipeline_stages`, `leads`, `deals`, and `deal_stage_history` tables,
`Lead`/`Deal`/`Pipeline`/`PipelineStage`/`DealStageHistory` models, and `LeadPolicy`/`DealPolicy`
already existed from Phase 2 scaffolding, but had no controllers/routes/tests. This pass added
those, plus:

- A migration (`2026_07_31_091541_add_lost_reason_and_closed_at_to_deals_table.php`) adding
  `lost_reason`, `probability_percent`, and `closed_at` to `deals` — needed for the won/lost
  workflow and not present in the original Phase 2 schema.
- `HasFactory` added to `Lead`/`Deal`/`Pipeline`/`PipelineStage` (missing previously, so no
  factories could be built) plus new `LeadFactory`/`DealFactory`/`PipelineFactory`/
  `PipelineStageFactory`.
- `DealStageHistory::$table` explicitly set to `deal_stage_history` (Eloquent's default
  pluralization guessed `deal_stage_histories`, which doesn't exist — this was a latent bug in
  the Phase 2 scaffolding that would have broken on first use).
- **`PipelineController`** — CRUD for pipelines + nested stage CRUD, and
  `GET /pipelines/{id}/board` (stages with grouped open deals, per-stage totals, overall total —
  one query round trip for the kanban UI). Read endpoints (`index`/`show`/`board`) are gated on
  `deals.manage` (so Agents/Managers can see the board they work deals on); write endpoints
  (create/update/delete pipeline or stage) are gated on `pipelines.manage` per
  `docs/07-permission-matrix.md` (Super Admin/Administrator only). Deleting a pipeline or stage
  that still has deals is rejected (422) rather than cascading.
- **`LeadController`** — full CRUD gated on `leads.manage`, plus
  `POST /contacts/{id}/convert-to-lead` and `POST /conversations/{id}/convert-to-lead` (the
  latter resolves the conversation's linked contact and defaults `source` to `whatsapp`; the
  former defaults to `manual`). Per-record update/delete additionally goes through
  `LeadPolicy`'s "own record" scoping (owner or a user with `users.manage`/`roles.manage`).
- **`DealController`** — full CRUD gated on `deals.manage`, `PATCH /{id}/stage` (validates the
  target stage belongs to the deal's pipeline, rejects moves on already-closed deals, writes a
  `deal_stage_history` row), `POST /{id}/won` (sets `probability_percent=100`, `status=won`,
  `closed_at=now()`), `POST /{id}/lost` (requires `lost_reason`, sets `probability_percent=0`).
- Every mutation (`AuditLogger::log()`) records `pipeline.created/updated/deleted`,
  `pipeline_stage.created/updated/deleted`, `lead.created/updated/deleted/converted`,
  `deal.created/updated/stage_moved/won/lost/deleted`.
- **`PipelineSeeder`** — seeds a "Default Sales Pipeline" (New → Contacted → Qualified →
  Proposal → Negotiation → Won → Lost) for any workspace that doesn't already have one, and
  wires it to `workspace_settings.default_pipeline_id`. Idempotent (checked before running via
  `WorkspaceSeeder`/`DatabaseSeeder`), added to `DatabaseSeeder`'s call list.
- Routes: `routes/api.php`, new `leads`, `deals`, `pipelines` groups plus
  `contacts/{contact}/convert-to-lead` and `conversations/{conversation}/convert-to-lead`, all
  under `auth:sanctum`+`active`.
- **Tests**: `tests/Feature/LeadTest.php`, `DealTest.php`, `PipelineTest.php` — 21 new tests
  covering permission enforcement per endpoint/role, workspace isolation, lead conversion from
  both a contact and a conversation (asserting the correct `source`/linkage), deal creation
  writing the initial stage-history row, stage moves writing history and rejecting moves on
  closed deals, won/lost transitions (lost requires `lost_reason`, returns 422 without it),
  pipeline board totals (per-stage and overall), and pipeline/stage deletion being blocked while
  deals exist.

**Verified:** `php artisan test` → **93/93 passed** (324 assertions), up from 72 — all prior
tests still pass unmodified, plus the 21 new tests across the three new suites. Also verified
`php artisan migrate:fresh --seed` runs clean end-to-end with the new `PipelineSeeder` step.

### Frontend (`frontend/`)

- **`src/lib/leads-api.ts`**, **`deals-api.ts`**, **`pipelines-api.ts`** — typed clients
  following `contacts-api.ts`'s envelope-unwrapping conventions.
- **`src/hooks/use-leads.ts`**, **`use-deals.ts`**, **`use-pipelines.ts`** — React Query hooks.
  `use-deals.ts`'s `useMoveDealStage` implements optimistic cache updates on the pipeline-board
  query (moves the card between stage buckets and recomputes totals immediately, rolling back to
  the pre-mutation snapshot on error) — the first optimistic-mutation pattern in this codebase;
  established here since none existed to match.
- **Routes**: `/leads` (filter by status/source, paginated table), `/leads/[id]` (detail, status
  change, linked deals, delete), `/pipeline` (kanban board via the board endpoint — cards use a
  "Move to: {stage}" `<select>` per card rather than real drag-and-drop, since no drag library
  was already in the project and adding one wasn't justified for a functional fallback that
  calls the real stage-move API on every selection), `/deals/[id]` (value, probability, full
  stage-history timeline, won/lost actions — lost requires typing a reason in an inline prompt
  before the API call fires), `/settings/pipelines` (create/rename/delete pipelines and stages,
  gated on `pipelines.manage`).
- **`/contacts/[id]`**: the Phase-8 "No leads/deals yet (Phase 9)" placeholder is gone — leads
  and deals now render as real links into `/leads/{id}` / `/deals/{id}`, and a "Convert to lead"
  button (gated on `leads.manage`) appears in the header and inline in the empty-leads state.
- **`src/components/inbox/contact-context-panel.tsx`**: added a "Convert to lead" button (gated
  on `leads.manage`) that calls the conversation-conversion endpoint and navigates to the new
  lead.
- **Sidebar** (`src/components/layout/sidebar.tsx`): added "Leads" (gated `leads.manage`),
  "Pipeline" (gated `deals.manage`), and "Pipeline Settings" (gated `pipelines.manage`) entries.
- Every write action is permission-gated with `usePermission`/`RequirePermission` against the
  exact `leads.manage`/`deals.manage`/`pipelines.manage` names in
  `docs/07-permission-matrix.md`.

**Verified:** `npm run lint` → clean (no errors/warnings; one pre-existing `set-state-in-effect`
error was fixed during this pass by deriving the pipeline board's default pipeline id during
render instead of in a `useEffect`). `npm run build` → compiles clean; route list includes
`/leads` (static), `/leads/[id]` (dynamic), `/pipeline` (static), `/deals/[id]` (dynamic),
`/settings/pipelines` (static) alongside all pre-existing routes.

## Phase 11 — next steps (Labels, Global Search, Segmentation)

Not started. Per `docs/08-implementation-roadmap.md`, this phase covers:

- **Labels**: the `labels` table and `labels.manage` permission already exist in the schema/matrix
  (seeded per `RolePermissionSeeder`), but there's no `Label` model/controller/route yet — check
  `docs/04-database-design.md`'s `labels`/label-pivot table(s) (contacts already reference
  `LabelSummary` in `conversations-api.ts`, so a pivot likely already exists for at least
  contacts/conversations) before scaffolding. Needs CRUD gated on `labels.manage`, and
  attach/detach endpoints on whatever's labelable (contacts/conversations at minimum).
- **Global search**: `search.global` is seeded for every role. Needs a `GET /api/v1/search`
  (or similar) endpoint spanning contacts/conversations/leads/deals/tasks with a single query
  string, permission-filtered per result type (a Viewer's search shouldn't surface leads/deals
  they can't otherwise see), plus a frontend search UI (likely a topnav command-palette-style
  input given `Topnav` already exists in `src/components/layout/`).
  `saved_filters.manage_own`/`saved_filters.share` are also seeded but unused — likely belongs
  with this phase (saved search/filter presets) rather than a separate one.
- **Segmentation**: likely contact segments/lists built from filter criteria (status, labels,
  lead source, etc.) — check `docs/04-database-design.md` for a `segments` or `contact_lists`
  table before assuming one needs to be created from scratch; this wasn't referenced in Phase 2's
  scaffolding notes so it may need a new migration.
- Suggested order: (1) confirm/build `labels` CRUD + attach-detach (smallest, most self-contained),
  (2) global search endpoint + saved filters, (3) segmentation (largest unknown — needs a schema
  read first to see what, if anything, already exists).

## Phase 8 — Contacts

### Backend (`backend/`)

The `contacts` table, `Contact`/`ContactActivity`/`Label` models, and `ContactPolicy` already
existed from earlier scaffolding (migrations `2026_07_31_080014_create_contacts_table.php` etc.)
but had no controller, routes, or tests. This pass added those.

- **`app/Http/Controllers/Api/V1/ContactController.php`** — full CRUD plus import/export,
  following the `ConversationController` conventions (`ApiResponse` trait via the base
  `Controller`, `AuditLogger::log()` on every mutation, workspace isolation via the existing
  `BelongsToWorkspace`/`WorkspaceScope` global scope — no manual `workspace_id` filtering
  needed).
  - `GET /api/v1/contacts` — search (name/email/phone/company via `LIKE`), `owner_user_id`
    filter, `archived=1` to list soft-deleted, `sort`/`direction` (allow-listed columns only),
    pagination.
  - `GET /api/v1/contacts/{id}` — eager-loads `owner`, `whatsappContact`, `labels`,
    `conversations` (last 20), `activities` (last 50), `leads`, `deals`. Leads/deals tables exist
    (Phase 2 migrations) but have no API yet, so these relations return real (currently empty)
    arrays rather than fabricated data — genuinely populated once Phase 9 ships.
  - `POST /api/v1/contacts` — creates the contact and **flags** (never blocks) a duplicate
    phone-number match within the workspace: response includes
    `data.duplicate_of` (the pre-existing contact, or `null`). The row is created either way —
    explicit, testable behavior per the task spec.
  - `PATCH /api/v1/contacts/{id}` — CRM-enrichment fields only (`full_name`, `email`, `company`,
    `job_title`, `phone_number`, `custom_fields`, `owner_user_id`); no route middleware
    permission gate — authorization is delegated entirely to the pre-existing `ContactPolicy`
    (`contacts.edit` OR owner-with-`contacts.create`), so route-level and "own record" gating
    can't fall out of sync.
  - `DELETE /api/v1/contacts/{id}` — soft delete (archive), gated on `contacts.delete`.
  - `POST /api/v1/contacts/{id}/restore` — un-deletes (looks up via `withTrashed()`), same gate.
  - `POST /api/v1/contacts/import` — CSV (columns `full_name,email,company,job_title,phone_number`),
    gated on `contacts.create` (no separate `contacts.import` permission exists in the matrix).
    Returns a `{ created: [], failed: [], duplicates: [] }` report: every row is validated
    individually, invalid rows are reported with field errors and skipped, valid rows are
    always created, and a phone-number match against an existing contact adds an entry to
    `duplicates` (contact is still created — same "flag not block" rule as single create).
  - `GET /api/v1/contacts/export` — streamed CSV of the workspace's own contacts, gated on
    `contacts.export`.
  - Every create/update/archive/restore/import writes a `contact_activities` row (lightweight,
    contact-scoped timeline per `docs/04-database-design.md`'s intended split) in addition to
    the existing `audit_logs` entry (system-wide compliance/audit trail) — the two tables serve
    different consumers, so both are written rather than picking one.
- **Routes**: `routes/api.php`, new `contacts` group under the existing `auth:sanctum`+`active`
  middleware group, static `/export` and `/import` paths registered before the `{contact}`
  wildcard to avoid route-model-binding collisions.
- **Tests**: `tests/Feature/ContactTest.php`, 17 new tests — permission enforcement per
  endpoint/role (Viewer blocked from create/import/export, Agent blocked from
  archive/blanket-edit, owner-without-blanket-permission allowed to edit their own contact),
  workspace isolation (list + show), search/sort/pagination correctness, duplicate-flagging on
  both single create and CSV import, CSV import with a valid/invalid/duplicate row mix
  asserting the exact report shape, CSV export scoped to the caller's workspace, soft-delete +
  restore round-trip.

**Verified:** `php artisan test` → **72/72 passed** (285 assertions), up from 55 — the prior
55 all still pass unmodified, plus the 17 new Contact tests.

### Frontend (`frontend/`)

- **`src/lib/contacts-api.ts`** — typed client mirroring `conversations-api.ts`'s conventions
  (`unwrap`/`unwrapPaginated` over the shared `ApiResponse` envelope). Export uses
  `downloadContactsExport()` (blob fetch + client-side `<a download>` trigger) rather than a
  plain link, since a bare `href` can't carry the bearer token the API requires.
- **`src/hooks/use-contacts.ts`** — React Query hooks (list/detail/create/update/archive/
  restore/import) with cache invalidation on mutation, matching `use-conversations.ts`.
- **`src/components/contacts/contact-form.tsx`** — shared RHF+Zod create/edit form (CRM fields
  only), reused by both the new-contact and edit-in-place flows.
- **Routes**: `/contacts` (table: search, sort-by-column with direction toggle, pagination,
  loading skeleton/error/empty states, Import CSV / Export CSV / New contact actions each
  permission-gated), `/contacts/new` (create form, surfaces the duplicate-phone notice from the
  API instead of hiding it), `/contacts/[id]` (WhatsApp-profile panel, CRM-details panel with
  inline edit, conversation history list linking into `/inbox/{id}`, activity timeline, and a
  leads/deals panel that honestly renders "No leads yet (Phase 9)" when the arrays are empty
  rather than fabricating rows). Card view toggle was **not** built — table view was the
  stated priority and time was spent on real CSV import/export wiring instead.
  - CSV import UI shows the real validation report returned by the API (created/duplicate/
    failed counts plus per-row error/duplicate detail) — never a fake success toast.
- **Permissions**: every write action (create/edit/archive/restore/import/export) is gated with
  `usePermission`/`RequirePermission` against the exact `contacts.*` names in
  `docs/07-permission-matrix.md`; the "Contacts" sidebar entry (`src/components/layout/
  sidebar.tsx`) is now gated on `contacts.view` (previously unconditionally visible — fixed as
  part of this pass) and positioned after Inbox.

**Verified:** `npm run lint` → clean (no errors/warnings). `npm run build` → compiles clean;
route list includes `/contacts` (static), `/contacts/new` (static), `/contacts/[id]` (dynamic,
ƒ) alongside all pre-existing routes.

**Note:** the "Phase 9 — next steps" section that previously appeared here is superseded — see
the completed Phase 9 section at the top of this document. Labels UI (full CRUD, attach/detach
on contacts/conversations/leads/deals) is still deferred — the `labels`/`*_label` tables and
`Label` model exist, but there's no `/labels` API or UI yet; folded into the Phase 10+ backlog.

## Phase 6 — Media Hardening + Phase 7 — Shared Team Inbox UI

### Phase 6 — Gateway media hardening (`whatsapp-gateway/`)

What already existed from Phase 5 and was verified, not rebuilt: an S3-compatible client
(`src/lib/storage.ts`, `@aws-sdk/client-s3`, falls back to local disk if `S3_BUCKET` is unset),
Zod-validated `S3_*`/`MEDIA_*` env vars, MIME allow-list + max-size validation
(`validateMedia()` in `src/queues/media-download.queue.ts`), sha256 checksum computed and
stored in `message_media.checksum_sha256`, storage KEY stored in `message_media.storage_path`
(never a raw URL), and BullMQ retry (4 attempts, exponential backoff) on transient download
failures.

What this pass added:
- **Distinct permanent-failure state**: the media-download worker's `failed` listener now
  writes a `message_processing_failures` row with `error_context.permanent: true` and
  `attemptsMade` only once BullMQ's retry budget is exhausted, so "still retrying" is no longer
  indistinguishable from "gave up" — see `src/queues/media-download.queue.ts`.
- **Signed media access** (`src/lib/media-access.ts`, `resolveMediaAccess()`): resolves a
  `message_media.storage_path` key to a short-lived (5 min) S3 pre-signed GET URL via
  `@aws-sdk/s3-request-presigner` (S3/MinIO mode), or a local file path in local-disk dev mode.
  Exposed at `GET /internal/whatsapp/media/:mediaId/url` (internal-gateway-token protected,
  never reachable by the frontend directly).
- **Backend proxy**: `MediaController::url()` (new) + route
  `GET /api/v1/conversations/{conversation}/messages/{message}/media/{media}/url`, gated by
  `conversations.view`, verifies the media belongs to the given message/conversation and the
  conversation belongs to the requesting user's workspace *before* calling
  `GatewayClient::mediaUrl()`. The frontend never sees a storage key or bucket URL — only this
  proxied, time-boxed response.
- **Realtime event relay** (new, needed for Phase 7 below): `POST
  /internal/whatsapp/events/emit` (gateway) + `GatewayClient::emitEvent()` (backend) +
  `ConversationController::relayConversationEvent()`, called (best-effort, failures logged not
  thrown) after assign/close/reopen. Previously `conversation.assigned/closed/reopened` were
  documented in `docs/EVENT_CATALOG.md` but never actually emitted anywhere — the backend had no
  way to reach the gateway's Socket.IO layer. This closes that gap for real rather than having
  the inbox UI subscribe to events that would never fire.
- **Thumbnail generation was intentionally skipped.** Adding `sharp` (native binary, node-gyp)
  in this Windows/XAMPP-based dev environment was judged too risky to add and verify blind
  within this pass — flagging honestly rather than guessing it works. Revisit in a later phase
  once there's a controlled build/CI environment to validate the native binary against.

**Verified commands and results:**
- `npm run build` (`tsc`) — exit 0, zero errors.
- `npx vitest run` — **26/26 tests passed** (up from 17), 8 test files. New coverage: MIME
  rejection/oversize rejection (pre-existing, re-verified), `resolveMediaAccess()` signed-URL
  vs. local-file vs. missing-file paths (`src/lib/media-access.test.ts`), the
  retry-then-permanent-failure worker path in isolation
  (`src/queues/media-download.worker-failure.test.ts`), and the new
  `/media/:mediaId/url` + `/events/emit` internal routes including token rejection, 404 on
  unknown media, and the response never containing the raw storage path
  (`src/routes/internal-whatsapp.media-and-events.test.ts`).
- **Never exercised against a live MinIO/WhatsApp session** — no Docker/MinIO instance was
  brought up in this environment; the S3 SDK calls in `media-access.test.ts` are mocked, not a
  live integration test. This is a structurally-real code path (real AWS SDK v3 calls, real
  presigner) that is genuinely unverified end-to-end.
- Backend: `php artisan test` → still **55/55 passed** after adding `MediaController` and the
  `emitEvent` calls (assign/close/reopen tests now attempt a real, fast-failing local HTTP call
  to the unconfigured gateway URL and are caught/logged, adding ~2-4s to those two tests but not
  failing them).

### Phase 7 — Shared Team Inbox UI (`frontend/`)

Full three-panel inbox at `/inbox` (`app/(dashboard)/inbox/{layout,page}.tsx` +
`inbox/[conversationId]/page.tsx`), wired to real data only — no mock/fake conversations or
messages anywhere in the shipped code; empty states render when there's genuinely no data.

- **Left panel** (`components/inbox/conversation-list-panel.tsx`): search input (client-side
  filter over the loaded page), filter pills (All / Assigned to me / Unassigned / Unread / Open
  / Closed) that map to `GET /api/v1/conversations` query params, list items with contact
  name/last-message-preview/timestamp/unread badge, loading skeleton, empty state.
  ("Team" pill was dropped — the permission matrix's per-team filter needs a team picker the
  API doesn't expose yet; `team_id` filtering exists server-side and can be wired to a real
  team-select control once Phase 8+ builds team management UI, rather than fabricating a
  hardcoded team id here.)
- **Center panel** (`components/inbox/chat-panel.tsx`): header with contact identity,
  close/reopen actions gated on `conversations.close`/`conversations.reopen`; message timeline
  from `GET /api/v1/conversations/{id}/messages` (cursor pagination, "Load earlier messages"
  button loads upward), date separators, sender identity, delivery/read status ticks
  (queued/sent/delivered/read/failed), inline media previews via the new signed-media-access
  endpoint (`components/inbox/media-preview.tsx` — never a raw storage URL), reply-preview
  rendering when `replied_to_message_id` resolves to a loaded message (double-click a message to
  reply). Composer posts real text messages via `POST /conversations/{id}/messages`, gated on
  `conversations.reply`; attachment upload is a visibly-disabled paperclip button ("Attachments
  coming soon") rather than a fake working upload.
- **Right panel** (`components/inbox/contact-context-panel.tsx`): contact name/number/email,
  labels *if present on the conversation payload* (no separate `/labels` fetch — there is no
  `/labels` API yet, so this only ever renders what's already embedded, never a broken request;
  full Labels UI is Phase 11 per the roadmap), assigned user/team, status, assign-by-user-id
  quick action gated on `conversations.assign`, close/reopen quick actions.
- **Realtime**: `hooks/use-conversations.ts` subscribes via the existing `SocketProvider` to
  `message.created`/`message.updated`/`message.failed` (optimistic cache patch) and
  `conversation.created`/`updated`/`assigned`/`closed`/`reopened`/`read` (cache invalidation),
  joining `workspace:{id}:inbox` and `workspace:{id}:conversation:{id}` rooms — matching the
  exact event names in `docs/EVENT_CATALOG.md` and the room names already used by
  `src/lib/socket-server.ts`. Poll fallback (10s) mirrors the existing WhatsApp-status page's
  `refetchInterval: isConnected ? false : N` pattern.
- **Permissions**: `/inbox` route gated on `conversations.view` (the matrix has no
  `conversations.view_assigned` permission — verified against `docs/07-permission-matrix.md`
  and used the real name instead of inventing one); reply/assign/close/reopen actions gated on
  their specific permissions via the existing `usePermission`/`RequirePermission` pattern.
- **Navigation**: `/inbox` is now the default post-login route (root `/` redirect, login-page
  redirect, and the auth-cookie middleware's already-authenticated redirect all point at
  `/inbox` instead of `/dashboard`; `/inbox/:path*` added to the protected-route matcher). The
  sidebar's "Conversations" entry was renamed "Inbox" → `/inbox` and shows a live unread-count
  badge (`hooks/use-inbox-unread-count.ts`, reusing `GET /conversations?unread=1`'s
  `meta.total` rather than adding a dedicated count endpoint).

**Verified commands and results:**
- `npm run lint` — exit 0, zero warnings/errors.
- `npm run build` — exit 0. Route list from the build output:
  `/`, `/_not-found`, `/accept-invitation`, `/dashboard`, `/forgot-password`, `/inbox` (static),
  `/inbox/[conversationId]` (dynamic/server-rendered), `/login`, `/reset-password`,
  `/settings/users`, `/settings/whatsapp`, `/unauthorized`.
- **Never exercised against a running backend/gateway** — no dev server was started against
  live data in this pass; correctness of the wiring rests on matching the verified API
  contracts/event names above, not on a manual click-through. This is the honest gap to close
  before calling Phase 7 "done" in a live-verified sense.

### Phase 8 next steps (Contacts module)

1. Backend: `ContactController` (index/show/store/update/destroy), CSV import/export endpoints,
   activity-timeline aggregation (conversations + notes + deals touching a contact), following
   the same `permission:{name}` middleware + workspace-scoping pattern as
   `ConversationController`.
2. Backend: a real `/labels` CRUD + attach/detach endpoint so the inbox's right panel (and a
   future conversation-list "Team" filter) can do more than passively render whatever's already
   embedded on the conversation payload.
3. Frontend: `/contacts` list (search/filter/pagination, mirroring `conversation-list-panel.tsx`
   patterns), `/contacts/{id}` detail with an activity timeline, `/contacts/new` manual-create
   form (RHF + Zod, matching backend Form Request rules), CSV import/export UI.
4. Wire the inbox's right panel "Assign" control to a real user/team picker (currently a raw
   user-ID input) once a `/users` list-for-picker endpoint exists or is confirmed usable.
5. Bring up `docker compose up -d --build` at least once end-to-end (MinIO + gateway + backend +
   frontend) and manually exercise: QR login, one real inbound message with a media attachment,
   one real outbound reply, one assign/close/reopen — closing the "never live-verified" gap
   flagged above for both Phase 6 and Phase 7.
6. Consider `sharp`-based thumbnail generation once a controlled CI/build environment exists to
   validate the native binary (skipped this pass — see Phase 6 notes above).

## Phase 5 — Message Synchronization (historical)

Inbound/outbound message pipeline, dedup, media handling, and the conversations API. Verified
independently by re-running all test suites after the implementing agent finished (a prior stray
duplicate-agent incident meant self-reported completions were not trusted at face value).

**Gateway (`whatsapp-gateway/`)**: `src/whatsapp/inbound-pipeline.ts`, `message-normalizer.ts`,
`message-repository.ts`, `dispatch-repository.ts`, `status-pipeline.ts` — inbound normalization
(text/image/video/audio/voice/document/sticker/reply/reaction), `UNIQUE(workspace_id,
whatsapp_message_id)` dedup treated as an idempotent no-op (not a crash), unsupported message
types recorded rather than silently dropped, `message_processing_failures` on error, outbound
send with idempotency-key replay safety, delivery/read status events, and media
download/validation. `npm run build` clean, `npx vitest run` → **17/17 tests passed** (5 test
files, including the pre-existing Phase 4 connection-manager suite).

**Backend (`backend/`)**: `ConversationController` (index/show/messages/storeMessage/assign/
close/reopen/markRead), `GatewayClient::sendMessage()`, `/api/v1/conversations/*` routes gated by
the real permission names from the matrix. `php artisan test` → **55/55 tests passed** (up from
42), including 13 new `ConversationTest` cases.

**Known gaps / honest caveats**:
- Live WhatsApp send/receive was never exercised against a real account — only the mocked
  Baileys-socket unit tests and the Laravel↔gateway HTTP contract (mocked `GatewayClient` in
  backend tests) are verified.
- `markRead` only updates the backend-owned `conversation_participants` table; it does not reset
  the gateway-owned `conversations.unread_count` because no internal endpoint for that is
  documented in `docs/05-api-contract.md` — flagged rather than inventing an undocumented call.
- Media storage (MinIO/S3-compatible client) and full retry/backoff hardening were built but not
  load-tested; see Phase 6 next steps below.

*(Phase 6/7 next-steps that were listed here have been superseded — see the "Phase 6 — Media
Hardening + Phase 7 — Shared Team Inbox UI" section at the top of this document, which records
what was actually built and the current Phase 8 next steps.)*

## Phase 4 — WhatsApp Connection Management

Implements the gateway-side Baileys lifecycle, the backend proxy API, and the frontend settings
page for managing the single per-workspace WhatsApp session. **Critically: live WhatsApp linking
was never tested against a real account/number** — there is no WhatsApp device or phone number
available in this environment. Everything below that says "real Baileys calls" means the code is
structurally wired to the actual `@whiskeysockets/baileys` API and has passed `tsc`/build, but the
QR-scan → paired-device → send/receive path has not been exercised once end-to-end. What *is*
verified is the lifecycle state-machine logic itself, via unit tests against a fully mocked Baileys
socket.

### Gateway (`whatsapp-gateway/`)

- `src/whatsapp/session-repository.ts` — new data-access layer for
  `whatsapp_sessions` / `whatsapp_session_credentials` / `whatsapp_connection_events` (raw
  `mysql2` queries, no ORM). Auth-state files from `useMultiFileAuthState` are encrypted
  (AES-256-GCM, key from `CREDENTIALS_ENCRYPTION_KEY`) and mirrored into
  `whatsapp_session_credentials` on every `creds.update`; on gateway boot,
  `restoreCredentialsToDisk()` writes any persisted rows back to the session directory before
  Baileys is started, so a restarted gateway process resumes an existing session automatically
  without a fresh QR scan (`ConnectionManager.restoreOnBoot()`, wired in `src/index.ts`).
- `src/whatsapp/baileys-socket.ts` — extracts an `IBaileysSocket` interface (the subset of a
  Baileys `WASocket` that `ConnectionManager` touches: `ev.on('creds.update'|'connection.update')`,
  `end()`, `logout()`, `sendMessage()`) plus `createBaileysSocket()`, a thin factory around the
  real `makeWASocket()`. This is what makes the lifecycle logic unit-testable without a live
  device.
- `src/whatsapp/connection-manager.ts` — rewritten. States:
  `idle | connecting | qr_pending | connected | disconnected | reconnecting | auth_required | error`.
  QR strings from Baileys are converted to a `data:image/png;base64,...` URL (via the new `qrcode`
  dependency) before being persisted/emitted. On `connection.update` close events, the Baileys
  `DisconnectReason.loggedOut` status code is checked: a genuine logout clears persisted
  credentials and moves straight to `auth_required` (no retry); any other close is treated as
  transient and reconnected automatically with exponential backoff + jitter
  (`2s * 2^n` capped at 5 minutes, ±20% jitter, giving up after 10 attempts and moving to `error`).
  Every transition is both persisted (`whatsapp_sessions` row + a `whatsapp_connection_events`
  row) and emitted as an in-process `connection.updated` event.
- `src/lib/socket-server.ts` — new minimal Socket.IO server on the `/gateway` namespace with the
  Redis adapter (`@socket.io/redis-adapter`) wired in from the start (single instance today, but
  no rework needed to scale horizontally). `src/whatsapp/manager-instance.ts` is the process-wide
  `ConnectionManager` singleton that re-emits its `connection.updated` events onto
  `workspace:{workspaceId}` per `docs/EVENT_CATALOG.md`'s payload shape
  (`{status, qrCode, qrExpiresAt, phoneNumber}`).
- `src/routes/internal-whatsapp.routes.ts` — new internal control API, mounted at
  `/internal/whatsapp/*`, gated by a `X-Internal-Gateway-Token` header checked against
  `INTERNAL_GATEWAY_TOKEN` (Zod-validated): `GET /status`, `POST /connect`, `POST /disconnect`,
  `POST /reconnect`, `POST /logout`, `GET /events`.
- `src/config/env.ts` — added `INTERNAL_GATEWAY_TOKEN`, `CREDENTIALS_ENCRYPTION_KEY` (32-byte hex),
  `WHATSAPP_WORKSPACE_ID` (defaults to `1` — this gateway process manages exactly one
  workspace/session for now; multi-tenant gateway routing is out of scope for Phase 4).
- **Tests** (new: `vitest` + `vitest.config.ts`/`vitest.setup.ts`, wasn't configured before):
  `src/whatsapp/connection-manager.test.ts`, 5 tests, all against a mocked `IBaileysSocket` and a
  mocked `SessionRepository` (no real MySQL/Redis needed to run these):
  1. QR event → persisted (`repository.updateStatus` with the data-URL QR) and emitted
     (`connection.updated` listener fires with `status: 'qr_pending'`).
  2. `connection: 'open'` → `connected` state, event recorded, `lastConnectedAt` persisted.
  3. `connection: 'close'` with a `loggedOut` status code → `auth_required`, credentials deleted,
     `logged_out` event recorded.
  4. `connection: 'close'` with a transient status code → `reconnecting` state, a
     `reconnect_attempt` event recorded, and a backoff timer scheduled (asserted via
     `vi.useFakeTimers`).
  5. `creds.update` → `persistCredentialsFromDisk` called with the session id and auth dir.
- **Verified commands and real output:**
  - `npx tsc -p tsconfig.json` → clean, no output (success).
  - `npx eslint "src/**/*.ts"` → clean, no errors/warnings.
  - `npx vitest run` → `Test Files 1 passed (1)`, `Tests 5 passed (5)`.

### Backend (`backend/`)

- `app/Services/GatewayClient.php` — new service wrapping Laravel's `Http` client, reading
  `config('services.whatsapp_gateway.{base_url,token,timeout}')` (new `config/services.php` block,
  env vars `WHATSAPP_GATEWAY_URL`/`WHATSAPP_GATEWAY_TOKEN`/`WHATSAPP_GATEWAY_TIMEOUT` added to
  `.env.example`). Wraps connection failures and non-2xx gateway responses into a `RuntimeException`
  the controller turns into a `502`.
- `app/Http/Controllers/Api/V1/WhatsappController.php` — new. `status`/`qr` proxy
  `GatewayClient::status()`; `connect`/`disconnect`/`reconnect` proxy the matching gateway call and
  each writes an `AuditLogger::log('whatsapp.connect'|'disconnect'|'reconnect', ...)` entry.
  `connectionHistory` reads `WhatsappConnectionEvent` directly from the database (it's a
  gateway-owned, `ReadOnlyFromBackend` table per `docs/DATA_OWNERSHIP.md` — no reason to proxy a
  read through the gateway). All five routes use the existing `{success, message, data}`
  `ApiResponse` trait format.
- `routes/api.php` — new `whatsapp.*` route group under `/api/v1/whatsapp`, gated by
  `->middleware('permission:whatsapp.connection.manage')` (the exact permission name from
  `docs/07-permission-matrix.md` — note it is `whatsapp.connection.manage`, not `whatsapp.manage`
  as an earlier draft of this task assumed): `GET /status`, `GET /qr`, `POST /connect`,
  `POST /disconnect`, `POST /reconnect`, `GET /connection-history`.
- **Tests**: `tests/Feature/WhatsappConnectionTest.php`, 8 new tests — permission enforcement
  (an `Agent`, who lacks `whatsapp.connection.manage`, gets `403` on `/status`), correct proxying
  with `Http::fake()` (status/qr/connect/disconnect/reconnect all assert the gateway URL and
  `X-Internal-Gateway-Token` header were hit, and that the response body flows through), a `502`
  case when the gateway is unreachable, audit-log-entry creation for connect/disconnect/reconnect,
  and connection-history reading real (raw-inserted, since the models are read-only from Eloquent)
  `whatsapp_sessions`/`whatsapp_connection_events` rows scoped to the caller's workspace.
- **Verified commands and real output:** `php artisan test` → **42 passed (206 assertions)**,
  0 failures (34 pre-existing + 8 new `WhatsappConnectionTest` cases).

### Frontend (`frontend/`)

- `src/lib/whatsapp-api.ts` — typed axios calls for all five backend endpoints, using the
  existing `unwrap()` helper.
- `src/hooks/use-whatsapp-connection.ts` — `useWhatsappStatus({enabled})` (TanStack Query,
  subscribes to the existing `SocketProvider`'s `connection.updated` event and pushes it directly
  into the query cache via `setQueryData`; falls back to a 5s poll only when `isConnected` is
  false), `useWhatsappConnectionHistory()`, `useWhatsappActions()` (connect/disconnect/reconnect
  mutations that invalidate both queries on success).
- `src/app/(dashboard)/settings/whatsapp/page.tsx` — new page, gated with the existing
  `RequirePermission permission="whatsapp.connection.manage"` pattern from Phase 3. Renders all
  required states (`idle`/`disconnected` → Connect button; `qr_pending` → QR image with expiry
  check and a refresh action; `connecting`/`reconnecting` → status text; `connected` → Reconnect +
  Disconnect (with a confirmation dialog); `auth_required` → explicit re-auth messaging and a
  reconnect action; `error` → retry action) plus a connection-event timeline reading
  `connection-history`.
- `src/components/layout/whatsapp-status-indicator.tsx` — small always-visible topnav badge
  (colored dot + label), only rendered for users with `whatsapp.connection.manage`, wired into
  `src/components/layout/topnav.tsx`.
- Sidebar (`src/components/layout/sidebar.tsx`) — added a `whatsapp.connection.manage`-gated
  "WhatsApp Connection" nav entry alongside the existing `users.manage` one, same pattern.
- **Known integration gap (not resolved this round):** `SocketProvider` connects to the *default*
  Socket.IO namespace at `NEXT_PUBLIC_SOCKET_URL` (`http://localhost:4000` by default), while the
  gateway's connection events are emitted on the `/gateway` namespace (per
  `docs/EVENT_CATALOG.md` and the new `src/lib/socket-server.ts`). For live updates to actually
  arrive, `NEXT_PUBLIC_SOCKET_URL` needs to point at `<gateway-host>/gateway`, or
  `socket-provider.tsx` needs an explicit namespace change — this is a one-line env/config fix,
  not a code defect, but it was not verified against a running gateway in this environment and is
  called out explicitly rather than silently assumed to work. The 5-second polling fallback means
  the page is still functionally correct even if the socket never connects to the right namespace.
- **Verified commands and real output:**
  - `npm run lint` → clean, zero errors/warnings.
  - `npm run build` (Next.js 16.2.12, Turbopack) → `Compiled successfully`, TypeScript check
    passed, all 12 routes statically generated including the new `/settings/whatsapp`. Same
    pre-existing `middleware`→`proxy` deprecation notice as Phase 3, unrelated to this change.

### What was NOT verified (be explicit about this)

- No real WhatsApp account/phone number was available, so: QR generation → phone scan → paired
  session → message send/receive was never run end-to-end. `makeWASocket()`,
  `useMultiFileAuthState()`, `DisconnectReason` handling, and `sendMessage()` are real Baileys API
  calls (not stubs), but they have zero live-execution history in this environment.
- The Socket.IO `/gateway` namespace was never connected to by a running frontend in this session
  (no live gateway process + MySQL + Redis stack was stood up) — the namespace-mismatch item above
  is a code-review finding, not something caught by a failing integration test, because no such
  integration test could be run without live infrastructure.
- MySQL/Redis-dependent gateway code paths (`SessionRepository`, `socket-server.ts`'s Redis
  adapter) are exercised in the unit tests only through mocks; no test connects to a real MySQL or
  Redis instance.

### Phase 5 next steps (message synchronization)

1. **Inbound pipeline**: gateway listens to Baileys' `messages.upsert`/`messages.update` events,
   normalizes WhatsApp message payloads (text/media/reactions/receipts) into the `messages` table
   schema from `docs/04-database-design.md`, and emits `message.created`/`message.updated` per
   `docs/EVENT_CATALOG.md`.
2. **Outbound pipeline**: wire `ConnectionManager.sendMessage()` into the already-scaffolded
   `outgoing-message.queue.ts` BullMQ worker (currently throws `NotImplemented` for every job),
   with per-message status transitions (`queued → sent → delivered → read → failed`) and
   `message.failed` emission on exhausted retries.
3. **Deduplication**: WhatsApp message IDs (`key.id`) must be the idempotency key against the
   existing unique constraint proven in `tests/Feature/MessageUniqueConstraintTest.php` — decide
   how retried webhook/event deliveries and multi-device echoes get deduped before insert.
4. **Media handling**: download media referenced in inbound messages via Baileys'
   `downloadMediaMessage()`, store to the existing S3/MinIO-backed filesystem
   (`config/filesystems.php`), and persist a reference (not the raw bytes) on the message row.
5. **Sync checkpoints**: use the existing `whatsapp_sync_checkpoints` table to resume
   history/backfill sync after a gateway restart without re-processing already-ingested messages.
6. Fix the Socket.IO namespace mismatch flagged above before building the live inbox UI on top of
   it, since every subsequent realtime feature (typing indicators, read receipts, presence) shares
   the same `SocketProvider`.

## Phase 3 — Frontend Auth/RBAC wiring

Backend Phase 3 (Sanctum auth + RBAC middleware, 34/34 tests passing) was already done in a
prior update. This update completes the **frontend** half, which a prior agent run had left
unfinished (only a login page + stub context existed). Built directly against the real
endpoints in `backend/routes/api.php` — no mocked responses.

- **Routes added** (`frontend/src/app/(auth)/`): `forgot-password`, `reset-password`,
  `accept-invitation`, `unauthorized`, alongside the pre-existing `login`. `reset-password` and
  `accept-invitation` read `?token=` (and `?email=` for reset) from the query string rather than
  a dynamic `[token]` segment — simpler than the route-map's sketch and matches what a real email
  link needs (both endpoints require `token` in the POST body per
  `ResetPasswordRequest`/`AcceptInvitationRequest`). All forms use RHF + Zod, call the real axios
  client, and map the backend's `{success:false, errors: {field: [msg]}}` shape onto RHF field
  errors via a new shared helper (`frontend/src/lib/form-errors.ts::applyApiErrorsToForm`), with
  a form-level banner as fallback for non-field errors (e.g. 403 "account suspended").
- **Auth context extended** (`frontend/src/context/auth-context.tsx`): `AuthUser` now carries
  `roles: string[]` and `permissions: string[]` (matching `AuthController::userPayload()`
  exactly — Super Admins get every permission name server-side, so the frontend never
  special-cases the role). Added `can(permission)`, exposed via a new
  `frontend/src/hooks/use-permission.ts` (`usePermission(name)` / `usePermissions()`), and a
  `refresh()` method (re-runs `/auth/me`) used by the accept-invitation flow after it mints a
  fresh token.
- **Token storage** — reused the existing design from Phase 1
  (`frontend/src/lib/token-store.ts`): in-memory variable mirrored to `localStorage` for reload
  survival, plus a non-sensitive `crm_auth_present` cookie (never the real token) so the edge
  `middleware.ts` can gate routes without reading `localStorage`. Documented tradeoff unchanged:
  this is a pragmatic middle ground for a pure client-side SPA against a separate API origin, not
  as strong as backend-issued httpOnly cookies — see the docblock in that file for the full
  rationale.
- **401 / session-expiry handling** (`frontend/src/lib/api-client.ts`): the response interceptor
  now, on any 401, clears the token, dispatches a `window` `auth:session-expired` CustomEvent (so
  the in-tree `AuthProvider` can update React state immediately), and hard-redirects to
  `/login?reason=session_expired` as a fallback for requests that fire outside the mounted app
  shell. `AuthProvider` listens for that event and shows a toast.
- **Toast system** — no toast library was in `package.json`, so added a minimal self-contained
  one (`frontend/src/providers/toast-provider.tsx`, mounted in `app/layout.tsx` above
  `AuthProvider`) rather than pulling in a new dependency for one use case. Used for session
  expiry and the accept-invitation/forgot-password/reset-password success paths.
- **Route protection**: `frontend/src/middleware.ts` (edge, cookie-presence check) was already in
  place from Phase 1 and needed no changes. Added a client-side backstop,
  `frontend/src/components/auth/auth-guard.tsx`, wrapping `(dashboard)/layout.tsx` — redirects to
  `/login` once `/auth/me` resolves with no user (covers the gap where a client-side session
  death hasn't yet cleared the edge cookie). Added
  `frontend/src/components/auth/require-permission.tsx` for permission-level gating and proved
  the end-to-end pattern on a new placeholder route, `frontend/src/app/(dashboard)/settings/users/page.tsx`,
  gated on `users.manage`.
- **Sidebar** (`frontend/src/components/layout/sidebar.tsx`): added a `permissionGatedNavItems`
  list, filtered through `usePermission`, so "User Management" only renders for users whose
  `/auth/me` response includes `users.manage`. Per `docs/06-frontend-route-map.md` §4 and
  `docs/07-permission-matrix.md` "Enforcement Points" §3, this and `require-permission.tsx` are
  explicitly UX-layer only — the backend's `permission:{name}` route middleware remains the real
  security boundary and is re-checked on every request regardless.
- **Not built this round** (deliberately out of scope per the task): the invitation-creation
  admin UI, user suspend/reactivate UI, and roles/teams management pages — `/settings/users` is a
  placeholder proving the permission-gating pattern, not the full admin CRUD screen (that's
  Phase 4+ CRM feature work, not auth plumbing).
- **Verified commands and results:**
  - `npm run lint` — clean, zero warnings/errors.
  - `npm run build` (Next.js 16.2.12, Turbopack) — succeeded: `Compiled successfully`,
    TypeScript check passed, all 9 routes (`/`, `/accept-invitation`, `/dashboard`,
    `/forgot-password`, `/login`, `/reset-password`, `/settings/users`, `/unauthorized`,
    `/_not-found`) statically generated. Only warning is Next's own
    `"middleware" file convention is deprecated, use "proxy" instead` notice (pre-existing from
    Phase 1's `middleware.ts`, unrelated to this change, not a build error) — not addressed here
    to avoid scope creep on a working, tested file; flagged as a Phase 4+ cleanup candidate.

### Phase 3 next steps (Phase 4 — WhatsApp connection management)

1. **Gateway** (`whatsapp-gateway/`): implement the QR/session lifecycle end-to-end — attach the
   already-installed Socket.IO server to `app.ts`/`index.ts`, emit connection-state events
   (`qr`, `connecting`, `open`, `close`, `logged_out`) per `docs/EVENT_CATALOG.md`, and persist
   session state via the existing `whatsapp_sessions`/`whatsapp_session_credentials` tables
   (coordinate with `docs/DATA_OWNERSHIP.md` on who owns writes to which table).
2. **Backend**: build the internal gateway-facing API (`LARAVEL_INTERNAL_API_URL` consumer per
   Phase 1 gateway scaffolding) plus the workspace-facing `whatsapp.connection.manage`-gated
   endpoints (start/stop session, fetch current QR/status) referenced in the permission matrix.
3. **Frontend**: `app/(dashboard)/settings/whatsapp/page.tsx` per `docs/06-frontend-route-map.md`
   — QR code display (likely via the gateway's Socket.IO `qr` event, reusing the existing
   `SocketProvider`), connection status indicator, reconnect/logout actions, gated on
   `whatsapp.connection.manage` using the same `usePermission`/`RequirePermission` pattern just
   built in Phase 3.
4. Once WhatsApp connection management exists, the inbox 3-panel shell
   (`docs/06-frontend-route-map.md` §2) becomes unblocked as the next major frontend surface.

## Phase 2 — Database & Tenancy

**backend/** — full schema from `docs/04-database-design.md` implemented and verified against
both a real MySQL 8 server and SQLite (used for the automated test suite).

- **Migrations** (`database/migrations/`, 44 new files + the 4 pre-existing Laravel/Sanctum
  ones = 48 total): every table from the design doc — workspaces, workspace_settings, users,
  roles, permissions, role_user, permission_role, teams, team_user, invitations,
  whatsapp_sessions, whatsapp_session_credentials, whatsapp_connection_events,
  whatsapp_sync_checkpoints, whatsapp_contacts, contacts, conversations,
  conversation_assignments, conversation_participants, messages, message_media,
  message_status_events, message_reactions, message_dispatch_queue,
  message_processing_failures, leads, pipelines, pipeline_stages, deals, deal_stage_history,
  contact_activities, internal_notes, note_mentions, tasks, task_comments, task_reminders,
  labels, contact_label/conversation_label/lead_label/deal_label, notifications,
  notification_preferences, audit_logs, user_presence, saved_filters. Ordered so every FK
  dependency is satisfied (two circular pairs — `whatsapp_contacts.contact_id` ↔ `contacts`,
  and `messages` ↔ `conversation_participants.last_read_message_id` — are resolved with a
  same-day follow-up migration adding the FK after both tables exist). `UNIQUE(workspace_id,
  whatsapp_message_id)` enforced on `messages`; `deals.value_amount` is `DECIMAL(12,2)`; soft
  deletes (`deleted_at`) on `users`, `contacts`, `leads`, `deals`, `tasks` per the doc; every
  tenant table carries an indexed `workspace_id` FK (`cascadeOnDelete`), with `nullOnDelete`/
  `restrict` matched to the doc per column.
- **Models** (`app/Models/`, 39 files): one per table with `$fillable`, `casts()` (decimal for
  money, `datetime`, `array`/JSON for JSON columns), and full relationship graph
  (belongsTo/hasMany/belongsToMany/hasManyThrough as applicable — e.g.
  `Conversation::messages()`, `Deal::pipeline()`/`pipelineStage()`, `Contact::conversations()`).
  Pivot relations use `withPivot('created_at')` (not `withTimestamps()`) because every pivot in
  the design doc has `created_at` only, no `updated_at`.
- **Workspace scoping** — `app/Models/Scopes/WorkspaceScope.php` (global scope,
  `Illuminate\Database\Eloquent\Scope`) + `app/Models/Concerns/BelongsToWorkspace.php` (trait
  applied to every tenant-scoped model). Design choice (documented in the trait's docblock):
  scope resolves the current workspace from the authenticated user
  (`auth()->user()->workspace_id`) when present, and is a no-op (unscoped) otherwise — matching
  `docs/DATA_OWNERSHIP.md`'s single-workspace-per-deployment model while keeping the constraint
  enforced at the query layer so the schema stays portable to true multi-tenant later. The
  trait also auto-fills `workspace_id` on `creating()` from the current user.
  `app/Models/Concerns/ReadOnlyFromBackend.php` exists for the gateway-owned models backend only
  reads (per the ownership boundary in `DATA_OWNERSHIP.md`).
- **Seeders** (`database/seeders/`): `WorkspaceSeeder` (default workspace), `PermissionSeeder`
  (full permission catalog transcribed from `docs/07-permission-matrix.md`),
  `RolePermissionSeeder` (5 system roles — Super Administrator, Administrator, Manager, Agent,
  Viewer — with `permission_role` mappings matching the matrix exactly), `AdminUserSeeder` (demo
  Super Admin, `admin@example.com`, password hashed via `Hash::make('ChangeMe123!')`).
  **`ChangeMe123!` is a placeholder for local/dev seeding only — not a real secret. It must be
  rotated or the seeder disabled before any non-dev environment is seeded.**
- **Tests** (`tests/Feature/`, Pest-compatible PHPUnit test classes since the existing test
  suite uses plain PHPUnit `TestCase` style): `MigrationsTest` (all Phase 2 tables exist, every
  tenant table has `workspace_id`, soft-delete tables have `deleted_at`, `deals.value_amount` is
  decimal/numeric), `WorkspaceIsolationTest` (records in workspace A never leak into a query
  scoped to workspace B — covers `Contact`, plus an auth-context test proving unauthenticated
  queries are unscoped and authenticated creates auto-fill `workspace_id`),
  `MessageUniqueConstraintTest` (duplicate `whatsapp_message_id` within one workspace rejected;
  same id across two workspaces allowed), `RolePermissionSeedingTest` (role/permission counts
  and mappings, Super Admin has every permission, Viewer cannot create contacts, full seeder
  creates the hashed demo admin), `ModelRelationshipsAndSoftDeletesTest` (conversation→messages,
  deal→pipeline, contact→conversations-style relations; soft deletes excluded from default
  queries but still present in the DB).
- **Database driver decision**: MySQL **was** exercised for real. `.env` already pointed at
  MySQL (`crm_whatsapp`); the database didn't exist yet so it was created via a one-off PDO
  call, then `php artisan migrate:fresh --seed --force` was run against it successfully — 55
  tables created, 5 roles / 37 permissions / 121 `permission_role` mappings / the demo admin
  seeded. Separately, per the task's instruction to prefer SQLite in-memory for the automated
  suite, `phpunit.xml` and `.env.testing` already forced `DB_CONNECTION=sqlite`,
  `DB_DATABASE=:memory:`, which is what `php artisan test` runs against.
  **Note on process:** getting a clean MySQL run required fixing a real bug caught along the
  way — the original Laravel stock migration (`0001_01_01_000000_create_users_table.php`) had
  been edited (by a prior pass in this build, not by this task's design) to also create
  `workspaces` inline, duplicating the dedicated `2026_07_31_080001_create_workspaces_table.php`
  migration and causing "table already exists" failures on both MySQL and SQLite. It's fixed
  back to a clean stock `users`/`password_reset_tokens`/`sessions` migration; workspace creation
  now lives solely in its own migration. Two model pivot relations
  (`role_user`/`permission_role`/`team_user`/label pivots) were also using
  `->withTimestamps()`, which assumes an `updated_at` column the schema intentionally omits on
  pivots — fixed to `->withPivot('created_at')`.
- **Verified commands and results:**
  - `php artisan migrate:fresh --force` (SQLite, isolated file DB) — exit 0, all 48 migrations
    `DONE`.
  - `php artisan migrate:fresh --seed --force` (MySQL, `crm_whatsapp`) — exit 0, all migrations
    + all 4 seeders `DONE`.
  - `php artisan test` — **22 passed (120 assertions)**, 0 failures, ~3s, run against the
    SQLite in-memory testing connection.

### Phase 2 next steps (Phase 3 — Auth/RBAC API + frontend auth wiring)

1. Backend: Sanctum-based `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`,
   `GET /api/v1/auth/me`, token issuance/revocation.
2. Backend: `EnsureWorkspaceScope` middleware (or confirm the `BelongsToWorkspace`
   auth()-based resolution is sufficient once real auth exists) + Gates/Policies keyed on the
   permission strings seeded in Phase 2 (`contacts.edit`, `conversations.assign`, etc.), with
   "Own"/"Team" scoping implemented at the policy level per `docs/07-permission-matrix.md` §2.
3. Backend: `roles.manage`/`users.manage`/`invitations.manage` CRUD endpoints, wired to the
   seeded roles/permissions.
4. Backend: audit-log write path (`audit_logs`) triggered from the permission-gated mutations
   listed in `docs/07-permission-matrix.md` §"Enforcement Points".
5. Frontend: wire the existing `AuthProvider`/login page to the new `/auth/*` endpoints; add
   route guards keyed on permission strings once the backend exposes `GET /auth/me` with the
   user's resolved permission set.
6. **Security follow-up before any shared/staging deployment:** rotate or remove the
   `admin@example.com` / `ChangeMe123!` seeded credential (see `AdminUserSeeder`) — it is a
   dev-only placeholder, not a secret suitable for any non-local environment.

## Done

### Phase 0 — Documentation
All written to `docs/`, cross-referenced and internally consistent:
`01-requirements-summary.md`, `02-gap-analysis.md`, `03-system-architecture.md` (mermaid
container diagram), `04-database-design.md` (~40 tables + ERD), `05-api-contract.md`,
`06-frontend-route-map.md`, `07-permission-matrix.md` (38 permissions x 5 roles),
`08-implementation-roadmap.md`, `09-testing-strategy.md`, `10-deployment-plan.md`,
`11-key-flows.md` (5 mermaid sequence diagrams), `DECISIONS.md`, `DATA_OWNERSHIP.md`,
`EVENT_CATALOG.md`.

### Phase 1 — Scaffolding

**frontend/** — Next.js 14+ App Router, TypeScript strict, Tailwind + shadcn/ui initialized
with the CRM color tokens as CSS variables (light + dark), TanStack Query provider, axios API
client (`src/lib/api-client.ts`) wired to `NEXT_PUBLIC_API_URL` with response-envelope
unwrapping, real `AuthProvider` calling `POST /auth/login` / `GET /auth/me` (no fake success),
Socket.IO client provider, sidebar/topnav app shell, RHF+Zod login page, route-protection
middleware, ESLint + Prettier.
- **Verified:** `npm install` succeeded (356 packages). `npm run lint` passed. `npm run build`
  succeeded — static pages generated for `/`, `/login`, `/dashboard`.

**backend/** — Laravel 12 project via `composer create-project`, Sanctum installed and wired
into the `api` middleware group, MySQL as default DB connection (env-driven), Redis as default
queue connection, `GET /api/v1/health` returning the standardized envelope, `ApiResponse` trait
(`success()/error()/failure()`) used by base `Controller`, CORS configured from `FRONTEND_URL`,
`.env.testing` forcing sqlite in-memory for tests.
- **Verified:** PHP 8.2.12 / Composer 2.10.2 available. `composer install` succeeded.
  `php artisan test` passed (3 tests, 11 assertions), including a feature test on the health
  endpoint. `php artisan --version` → Laravel Framework 12.64.0.

**whatsapp-gateway/** — Node + TypeScript strict, Express app, Zod-validated env
(`src/config/env.ts`, exits with a formatted error list on invalid config), Pino logger,
`GET /healthz` (liveness) and `GET /readyz` (checks Redis ping + MySQL `SELECT 1`), BullMQ
queue skeleton (`outgoing-message.queue.ts` — processor intentionally throws
`NotImplementedError`, no fake "sent" success), `ConnectionManager` class that imports and
constructs real Baileys (`makeWASocket`/`useMultiFileAuthState`) but has **not** been run
against a live WhatsApp account, graceful shutdown on SIGTERM/SIGINT.
- **Verified:** `npm install` succeeded (341 packages). `npm run build` (`tsc`) succeeded with
  zero errors.
- **Not wired yet:** Socket.IO server is installed but not yet attached to `app.ts`/`index.ts`
  (no realtime event contract implemented against the `EVENT_CATALOG.md` spec yet — deferred to
  the phase where the inbox realtime path is built).

**infrastructure/** — `docker-compose.yml` (mysql, redis, minio, backend, frontend,
whatsapp-gateway, nginx, health checks, named volumes) and `docker-compose.production.yml`
overlay (resource limits, no bind mounts, restart policies, no exposed DB ports). Per-service
`Dockerfile`s for backend (PHP-FPM/Alpine), frontend (multi-stage Next.js build), and gateway
(multi-stage Node build). `infrastructure/nginx/nginx.conf` proxies frontend, `/api/`,
`/gateway/`, and `/socket.io/` with websocket upgrade headers.
- **Not verified:** `docker compose up` / actual container builds have not been run in this
  environment (no assumption made about Docker daemon availability here). This is flagged as
  pending verification, not claimed as tested.

**Root files** — `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `.env.example` (all services'
vars in one reference file), this file.

## Pending / explicitly not done

- Database migrations, Eloquent models, factories, and seeders are now done — see "Phase 2 —
  Database & Tenancy" above.
- RBAC **schema and seed data** are done (roles/permissions/pivot tables, 5 seeded roles, full
  permission catalog, exact matrix mappings). Gates/Policies/route middleware that *enforce*
  permissions at the HTTP layer are still not built — deferred to Phase 3 (see next steps
  above).
- No real business-logic controllers/routes beyond the health check.
- WhatsApp gateway: Socket.IO server not attached; Baileys connection never live-tested (no
  WhatsApp account available in this environment) — this is a real adapter with a real
  interface, not a stub, but genuinely unverified against a live session.
- SMTP/mail, production S3/MinIO credentials, and any other external credentials are only
  represented as env placeholders (`.env.example`) with real config plumbing (Laravel Mail
  config, AWS/MinIO S3 disk config) — never claimed as tested live.
- Docker Compose stack has not been brought up end-to-end in this environment; Dockerfiles are
  written but unbuilt/unverified here.
- Not a git repository yet — initialization intentionally deferred per instructions.

## Environment notes

- OS: Windows 10, PowerShell primary shell, Bash tool also available.
- PHP 8.2.12 and Composer 2.10.2 were available (XAMPP install) — backend scaffolding could be
  fully verified.
- Node.js and npm were available — frontend and gateway scaffolding could be fully verified.
- Docker availability was not exercised in this run; compose files are written to spec but
  unverified by an actual `docker compose up`.

## Next steps (Phase 2)

1. Backend: write Eloquent migrations for every table in `docs/04-database-design.md`, in
   dependency order (workspaces → users/roles/permissions → teams → whatsapp_* → contacts/
   conversations/messages → leads/deals/pipelines → tasks/notes/labels → notifications/
   audit_logs/saved_filters). Add models with relationships, factories, and a
   `WorkspaceSeeder`/`RolePermissionSeeder` seeding the 5 roles and the permission matrix from
   `docs/07-permission-matrix.md`.
2. Backend: implement Sanctum-based auth endpoints (register/login/logout/me), RBAC via
   Gates/Policies keyed on permission names, and `EnsureWorkspaceScope` middleware.
3. Gateway: attach Socket.IO server, define the rooms/events per `docs/EVENT_CATALOG.md`,
   write the migration-owned WhatsApp tables (or coordinate with backend migrations per
   `docs/DATA_OWNERSHIP.md`), and build the internal HTTP client to `LARAVEL_INTERNAL_API_URL`.
4. Frontend: build out the 3-panel inbox shell, contacts/leads/deals kanban pages, and connect
   TanStack Query hooks to the real backend endpoints once they exist.
5. Bring up `docker compose up -d --build` end-to-end and fix any integration issues; add this
   verification result to a future `PROJECT_STATUS.md` update.
