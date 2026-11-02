# CRM-WhatsApp Documentation Index

This directory contains architectural specifications, API contracts, deployment runbooks, and historical archives for the CRM-WhatsApp platform.

---

## Directory Overview

### 1. [Architecture](./architecture/)
System design, database schemas, authorization models, and event protocols:
- [03-system-architecture.md](./architecture/03-system-architecture.md) — End-to-end architecture (Next.js, Laravel, WhatsApp Gateway, Supabase).
- [04-database-design.md](./architecture/04-database-design.md) — PostgreSQL database schema, relational models, indexing strategies.
- [ACCESS_LIST.md](./architecture/ACCESS_LIST.md) / [07-permission-matrix.md](./architecture/07-permission-matrix.md) — Complete RBAC permission catalog (41+ permissions, 5 roles, scope policies).
- [DATA_OWNERSHIP.md](./architecture/DATA_OWNERSHIP.md) — Single source of truth and data ownership rules between services.
- [EVENT_CATALOG.md](./architecture/EVENT_CATALOG.md) — WebSocket and internal event catalog.
- [DECISIONS.md](./architecture/DECISIONS.md) — Architectural Decision Records (ADRs).

### 2. [API](./api/)
- [05-api-contract.md](./api/05-api-contract.md) — REST API endpoints, request/response formats, error structures, and internal gateway contracts.

### 3. [Deployment](./deployment/)
Runbooks, security checklists, and environment specifications:
- [render-deployment.md](./deployment/render-deployment.md) — Render Free Tier deployment guide.
- [security-checklist.md](./deployment/security-checklist.md) — Pre-production security auditing checklist.
- [10-deployment-plan.md](./deployment/10-deployment-plan.md) — Deployment stages and verification procedures.

### 4. [Archive](./archive/)
Historical planning documents, sprint backlogs, initial gap analyses, legacy stack guides (MySQL/Redis/Azure/Nginx), and obsolete specs preserved for reference.
