# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — Phase 0-1 scaffolding — 2026-07-31

### Added
- Full Phase 0 documentation set in `docs/`: requirements summary, gap analysis, system
  architecture (with mermaid container diagram), database design (~40 tables + ERD), API
  contract, frontend route map, permission matrix (38 permissions x 5 roles), implementation
  roadmap, testing strategy, deployment plan, key-flow sequence diagrams, decisions log,
  data-ownership split, and realtime event catalog.
- `frontend/`: Next.js 14+ App Router scaffold, TS strict, Tailwind + shadcn/ui with CRM color
  tokens, TanStack Query provider, axios API client, auth context, Socket.IO client provider,
  app shell (sidebar/topnav), login page, route-protection middleware, ESLint/Prettier. Verified
  `npm install` and `npm run build` succeed.
- `backend/`: Laravel 12 project, Sanctum installed, MySQL/Redis config wired from env,
  `/api/v1/health` endpoint, standardized `ApiResponse` trait, CORS config. Verified
  `composer install` and `php artisan test` succeed (3 passing tests).
- `whatsapp-gateway/`: Node + TS + Express scaffold, Zod env validation, Pino logging,
  `/healthz` + `/readyz`, BullMQ queue skeleton, `ConnectionManager` class structured around
  Baileys (not live-tested), graceful shutdown. Verified `npm install` and `npm run build`
  succeed.
- `docker-compose.yml` and `docker-compose.production.yml` wiring mysql, redis, minio, backend,
  frontend, whatsapp-gateway, nginx with health checks and named volumes.
- `infrastructure/nginx/nginx.conf` with websocket-upgrade support for Socket.IO.
- Root `.env.example` covering all services.
- `README.md`, `PROJECT_STATUS.md`, `CONTRIBUTING.md`.

### Notes
- No database migrations, models, or seeders yet — that is Phase 2.
- WhatsApp gateway's Baileys connection has not been tested against a live WhatsApp account.
- Repository is not yet a git repository; version control initialization is deferred to a later step.
