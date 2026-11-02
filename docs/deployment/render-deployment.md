# Deploying on Render Free Tier with Supabase

This document describes deploying the CRM-WhatsApp stack to [Render](https://render.com) using the checked-in [`render.yaml`](../render.yaml) Blueprint under the **Free tier**.

The entire database, queue, cache, and object storage requirements are satisfied by **Supabase PostgreSQL** and **Supabase Storage**, eliminating the need for paid Redis, private MySQL services, or persistent disks on Render.

---

## Service Mapping

| Component | Render Service Name | Render Type | Plan | Storage / Backend |
|---|---|---|---|---|
| **Laravel Backend** | `crm-backend` | Web Service (Docker) | Free | Supabase PostgreSQL + Supabase S3 |
| **WhatsApp Gateway** | `crm-gateway` | Web Service (Docker) | Free | Supabase PostgreSQL + Supabase Storage |
| **Next.js Frontend** | `crm-frontend` | Web Service (Node.js) | Free | Render CDN / Edge |

---

## Architecture Highlights

1. **Zero Redis**:
   - Laravel uses the database driver for queues (`jobs` table) and cache (`cache` table).
   - WhatsApp Gateway uses `pg-boss` backed by Supabase PostgreSQL for background jobs.
   - Socket.IO uses in-memory adapter suited for single-instance Web Service.

2. **Zero MySQL**:
   - Supabase PostgreSQL powers all relational data and migrations.
   - Dialect compatibility layer and parameter rewriting ensure seamless operation.

3. **Zero Azure Blob**:
   - Media attachments and report exports land in Supabase Storage (`whatsapp-media` private bucket).
   - Laravel accesses Supabase Storage via Flysystem S3 (`FILESYSTEM_DISK=s3`).
   - Gateway accesses Supabase Storage via `@supabase/supabase-js`.

4. **Zero Nginx**:
   - Laravel container serves HTTP traffic directly with Apache configured for Render's dynamic `$PORT`.
   - Render handles TLS termination, public domains, and routing.

5. **Ephemeral Disk Resilience**:
   - WhatsApp Baileys credentials and auth states are encrypted with AES-256-GCM and persisted in the `whatsapp_session_credentials` database table. Sessions survive Render free-tier container restarts.

---

## Deployment Steps

1. **Set up Supabase**:
   - Create a project at [supabase.com](https://supabase.com).
   - Create a private bucket called `whatsapp-media`.
   - Obtain database connection string and S3 credentials.

2. **Deploy Blueprint on Render**:
   - Navigate to **Render Dashboard → New → Blueprint**.
   - Connect this repository.
   - Enter your Supabase credentials when prompted.
   - Click **Apply**.
