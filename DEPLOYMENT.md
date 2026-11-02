# Production Deployment Guide — Render Free & Supabase

This application is built for high-reliability deployment on **Render Free Tier** paired with **Supabase** (PostgreSQL + Object Storage).

The stack consists of exactly three deployable web services:
1. **Frontend**: Next.js App (`crm-frontend`) deployed on Render
2. **Backend**: Laravel PHP API & Queue Worker (`crm-backend`) deployed as a Render Docker Web Service
3. **WhatsApp Gateway**: Node.js & Baileys (`crm-gateway`) deployed as a Render Docker Web Service

---

## Infrastructure Overview

| Component | Technology | Hosting / Service |
|---|---|---|
| **Database** | PostgreSQL 15+ | Supabase PostgreSQL |
| **Storage** | Supabase Storage (`whatsapp-media` bucket) | Supabase S3-compatible API |
| **Queues** | PostgreSQL queues (`jobs` table in Laravel, `pg-boss` in Gateway) | Supabase PostgreSQL |
| **Cache & Locks** | PostgreSQL cache (`cache` table) | Supabase PostgreSQL |
| **Session Persistence** | AES-256-GCM Encrypted DB Sessions (`whatsapp_session_credentials`) | Supabase PostgreSQL |
| **TLS & Routing** | Managed HTTP/HTTPS termination | Render |

---

## 1. Supabase Setup

### Database
1. Create a new Supabase project at [supabase.com](https://supabase.com).
2. Note your connection details under **Project Settings > Database**:
   - Host (`db.<project-ref>.supabase.co`)
   - Port (`5432` or `6543` for connection pooling)
   - Database name (`postgres`)
   - Username (`postgres`)
   - Database password

### Storage
1. Navigate to **Storage** in Supabase Studio.
2. Create a **Private** bucket named:
   ```
   whatsapp-media
   ```
3. Generate S3 Access Keys under **Project Settings > Storage**:
   - Endpoint: `https://<project-ref>.supabase.co/storage/v1/s3`
   - Access Key ID: `<your-s3-access-key-id>`
   - Secret Access Key: `<your-s3-secret-access-key>`
   - Region: `auto` (or `us-east-1`)

---

## 2. Environment Variables Configuration

### A. WhatsApp Gateway (`crm-gateway`)
```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
PGHOST=db.<project-ref>.supabase.co
PGPORT=5432
PGDATABASE=postgres
PGUSER=postgres
PGPASSWORD=<password>
PGSSL=true

SUPABASE_STORAGE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<your-supabase-service-role-key>
SUPABASE_STORAGE_BUCKET=whatsapp-media

LARAVEL_INTERNAL_API_URL=https://<your-backend-app>.onrender.com/api/internal
INTERNAL_SHARED_SECRET=<64-char-random-secret>
INTERNAL_GATEWAY_TOKEN=<64-char-random-secret>
SOCKET_CORS_ORIGIN=https://<your-frontend-app>.onrender.com
CREDENTIALS_ENCRYPTION_KEY=<64-char-hex-key>
```

### B. Laravel Backend (`crm-backend`)
```env
APP_NAME="CRM WhatsApp"
APP_ENV=production
APP_KEY=base64:<generated-app-key>
APP_DEBUG=false
APP_URL=https://<your-backend-app>.onrender.com
FRONTEND_URL=https://<your-frontend-app>.onrender.com

LOG_CHANNEL=stderr
LOG_LEVEL=info

DB_CONNECTION=pgsql
DB_HOST=db.<project-ref>.supabase.co
DB_PORT=5432
DB_DATABASE=postgres
DB_USERNAME=postgres
DB_PASSWORD=<password>
DB_SSLMODE=require

CACHE_STORE=database
QUEUE_CONNECTION=database
SESSION_DRIVER=database

FILESYSTEM_DISK=s3
AWS_ACCESS_KEY_ID=<your-s3-access-key-id>
AWS_SECRET_ACCESS_KEY=<your-s3-secret-access-key>
AWS_DEFAULT_REGION=auto
AWS_BUCKET=whatsapp-media
AWS_ENDPOINT=https://<project-ref>.supabase.co/storage/v1/s3
AWS_USE_PATH_STYLE_ENDPOINT=true

WHATSAPP_GATEWAY_URL=https://<your-gateway-app>.onrender.com
INTERNAL_GATEWAY_TOKEN=<64-char-random-secret>
INTERNAL_SHARED_SECRET=<64-char-random-secret>
```

### C. Next.js Frontend (`crm-frontend`)
```env
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://<your-backend-app>.onrender.com/api/v1
NEXT_PUBLIC_SOCKET_URL=https://<your-gateway-app>.onrender.com
NEXT_PUBLIC_APP_URL=https://<your-frontend-app>.onrender.com
```

---

## 3. Deploy via Render Blueprint

This repository includes a production-ready [`render.yaml`](render.yaml) file:

1. Push your repository to GitHub or GitLab.
2. In Render Dashboard, click **New > Blueprint**.
3. Select your repository.
4. Fill in the required secret environment variables prompted by the blueprint.
5. Click **Apply**. Render will automatically build and deploy:
   - `crm-backend` (Web Service with direct Apache server & background queue worker)
   - `crm-gateway` (Web Service with Node.js Baileys engine & pg-boss queues)
   - `crm-frontend` (Next.js Web Service)

---

## 4. Local Testing with Docker Compose

To run the unified stack locally using PostgreSQL and Supabase Storage:

```bash
# 1. Prepare environment files
cp .env.example .env
cp backend/.env.example backend/.env
cp whatsapp-gateway/.env.example whatsapp-gateway/.env
cp frontend/.env.example frontend/.env.local

# 2. Start the 3 services
docker compose up -d --build

# 3. Run database migrations
docker compose exec backend php artisan migrate --force

# 4. Check container health
docker compose ps
curl -f http://localhost:8000/api/v1/health
curl -f http://localhost:4000/healthz
```

---

## 5. Operational Characteristics & Free Tier Notes

- **Spin-down on Inactivity:** Free Render instances spin down after 15 minutes of no inbound traffic. On incoming requests, containers cold-start in 30–50 seconds.
- **WhatsApp Session Resilience:** All Baileys authentication credentials and device keys are encrypted with AES-256-GCM and stored in Supabase PostgreSQL (`whatsapp_session_credentials`). When `crm-gateway` restarts or wakes from sleep, active sessions are restored automatically without re-scanning QR codes.
- **Queue Durability:** All queue jobs in Laravel and WhatsApp Gateway (`pg-boss`) persist in Supabase PostgreSQL, ensuring zero job loss during restarts.
- **Media Safety:** All uploaded media and report exports are stored in Supabase Storage with signed short-lived URLs.
