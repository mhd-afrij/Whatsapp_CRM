# WhatsApp CRM — Frontend

Next.js 15+ (App Router, TypeScript, Tailwind, ShadCN) frontend for the WhatsApp CRM & Team Collaboration Platform.

This repo was split out of the original `whatsapp-crm` monorepo (see the sibling `CRM` repo for the full product specification, architecture docs, and `docker-compose.yml` that runs this repo alongside `CRM-Backend`). Read `CLAUDE.md` and `docs/` there before making architectural changes.

## Local development

```bash
npm install
cp .env.example .env.local   # or reuse the working local .env.local already in this repo
npm run dev   # http://localhost:3000
```

Expects the Backend API at `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000/api/v1`) — see the sibling `CRM-Backend` repo.

## Checks

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## Current status

Auth (login/logout, route guard, silent refresh) is fully wired to the real API. `/team`, `/audit-log`, `/settings/roles` are wired to real data. `/inbox`, `/customers`, `/leads`, `/pipeline`, `/tasks`, `/calendar`, `/search`, `/analytics`, `/notifications`, `/settings`, `/settings/whatsapp` are static UI previews awaiting their backend modules — each page says so. See the `CRM` repo's `docs/IMPLEMENTATION_STATUS.md` for full detail; that document has not yet been split per-repo.
