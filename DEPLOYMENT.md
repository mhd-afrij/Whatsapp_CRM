# cPanel production deployment (no Terminal/SSH)

Domains:

- Frontend: `https://whatsapp.alphahgcrm.com`
- API: `https://api.whatsapp.alphahgcrm.com`
- Gateway: `https://gateway.whatsapp.alphahgcrm.com`

The ZIP is prebuilt because this cPanel account has no Terminal. The host must still provide PHP 8.2+, Composer-compatible PHP extensions, Setup Node.js App, long-running Node processes, WebSockets, and Cron Jobs. If Node apps or WebSockets are unavailable, the WhatsApp gateway cannot run reliably on this plan.

## Upload and extract

Upload the ZIP to `/home/CPANEL_USER/whatsapp.alphahgcrm.com/` and extract it so that `backend/`, `frontend/`, `whatsapp-gateway/`, and `storage/` are directly inside that directory. Do not upload any real `.env` file or WhatsApp credentials.

## API

Set the API domain document root to:

`/home/CPANEL_USER/whatsapp.alphahgcrm.com/backend/public`

Copy `backend/.env.production.example` to `backend/.env` in File Manager and fill in the cPanel database credentials, a unique `APP_KEY`, `WHATSAPP_GATEWAY_TOKEN`, and `INTERNAL_SHARED_SECRET`. These two gateway secrets must match the gateway `.env`.

The database must be migrated before first use. Without Terminal, use phpMyAdmin to import a SQL export generated from the exact production migrations, or ask the host to run `php artisan migrate --force` once. Do not run migrations against a local development database and upload its data as a substitute.

## Frontend Node.js application

Create a cPanel Node.js application:

- Node.js: 20
- Application root: `whatsapp.alphahgcrm.com/frontend`
- Startup file: `server.js`
- Application mode: Production
- Application URL: `whatsapp.alphahgcrm.com`

Set these environment variables before starting the app:

`NEXT_PUBLIC_API_URL=https://api.whatsapp.alphahgcrm.com/api/v1`

`NEXT_PUBLIC_SOCKET_URL=https://gateway.whatsapp.alphahgcrm.com`

`NEXT_PUBLIC_APP_URL=https://whatsapp.alphahgcrm.com`

The package includes `node_modules/`, `.next/`, `public/`, `package.json`, and `server.js`; no npm command is required on cPanel.

## Gateway Node.js application

Create a second cPanel Node.js application:

- Node.js: 20
- Application root: `whatsapp.alphahgcrm.com/whatsapp-gateway`
- Startup file: `dist/index.js`
- Application mode: Production
- Application URL: `gateway.whatsapp.alphahgcrm.com`

Copy `whatsapp-gateway/.env.production.example` to `.env` and fill in MySQL, external Redis, shared secrets, a 64-character hexadecimal `CREDENTIALS_ENCRYPTION_KEY`, and the cPanel absolute session/media paths. The package includes `dist/` and `node_modules/`.

The host must proxy and allow Socket.IO WebSockets. Test `https://gateway.whatsapp.alphahgcrm.com/healthz` after starting the application.

## Redis and queues

The gateway and BullMQ require Redis. Configure an external Redis service if cPanel does not provide Redis, including TLS settings as required by that provider. Laravel can use `QUEUE_CONNECTION=database` for shared hosting, but the gateway still requires Redis for BullMQ and Socket.IO coordination.

Create Cron Jobs where supported:

`php /home/CPANEL_USER/whatsapp.alphahgcrm.com/backend/artisan schedule:run`

Run it every minute. A persistent Laravel queue worker is not possible on many shared plans without Terminal; use a provider-supported worker or accept that queued reports/campaigns will not process continuously.

## Storage and permissions

Make these paths writable by the PHP/Node application user:

- `backend/storage/`
- `backend/bootstrap/cache/`
- `storage/sessions/`
- `storage/media/`

Do not upload real local sessions. Scan the WhatsApp QR code after the gateway is online. Back up sessions, media, and the MySQL database separately.

`php artisan storage:link` normally creates `backend/public/storage`. Without Terminal, create the equivalent symlink through the host panel if supported, or set `FILESYSTEM_DISK=azure` (plus the `AZURE_STORAGE_*` keys in the root `.env`) to store logos and report exports in Azure Blob Storage — see docs/production-deployment.md. Do not expose `backend/storage` directly.

## Verification

Check:

- `https://api.whatsapp.alphahgcrm.com/api/v1/health`
- `https://gateway.whatsapp.alphahgcrm.com/healthz`
- `https://whatsapp.alphahgcrm.com`
- login and Sanctum cookies
- Socket.IO connection and reconnect
- QR generation and WhatsApp pairing
- inbound/outbound messages
- media upload/download
- queue and scheduled jobs

## Rollback

Keep the previous extracted directory and database backup. Stop the Node applications, restore the previous package directory, restore only if a database rollback is explicitly required, and restart the Node applications. Never delete the previous package until the new deployment passes health and login checks.
