# Production Deployment

## Services

Deploy the monorepo as three application services plus shared infrastructure:

- `frontend/`: Next.js application, exposed to users through Nginx or the platform edge.
- `backend/`: Laravel API and queue workers, exposed at `/api/v1`.
- `whatsapp-gateway/`: Node/Baileys gateway for WhatsApp sessions, internal control APIs, queues, and Socket.IO.
- MySQL 8: primary relational database.
- Redis 7: Laravel queues/cache, BullMQ, and realtime coordination.
- Azure Blob Storage: production storage for Laravel-owned uploads and exports.

## Frontend

Set:

```env
NEXT_PUBLIC_APP_URL=https://crm.example.com
NEXT_PUBLIC_API_URL=https://crm.example.com/api/v1
NEXT_PUBLIC_SOCKET_URL=https://crm.example.com
```

Run:

```bash
cd frontend
npm ci
npm run build
npm run start
```

## Backend

Set production Laravel variables, database credentials, Redis credentials, Sanctum stateful domains, mail settings, gateway URL/token, and Azure Blob credentials.

```env
APP_ENV=production
APP_DEBUG=false
QUEUE_CONNECTION=redis
FILESYSTEM_DISK=local
AZURE_STORAGE_ACCOUNT_NAME=
AZURE_STORAGE_ACCOUNT_KEY=
AZURE_STORAGE_CONTAINER=
AZURE_STORAGE_URL=https://<account>.blob.core.windows.net
WHATSAPP_GATEWAY_URL=http://whatsapp-gateway:4000
WHATSAPP_GATEWAY_TOKEN=
```

Run:

```bash
cd backend
composer install --no-dev --optimize-autoloader
php artisan config:cache
php artisan route:cache
php artisan migrate --force
php artisan queue:work redis --tries=3
```

## WhatsApp Gateway

Set MySQL, Redis, internal token, encryption key, Socket.IO CORS origin, and workspace ID.

```env
NODE_ENV=production
INTERNAL_GATEWAY_TOKEN=
CREDENTIALS_ENCRYPTION_KEY=
SOCKET_CORS_ORIGIN=https://crm.example.com
WHATSAPP_WORKSPACE_ID=1
```

Run:

```bash
cd whatsapp-gateway
npm ci
npm run build
npm run start
```

## Database

Before deploy:

```bash
infrastructure/scripts/mysql-backup.sh
php artisan migrate --pretend
```

After deploy:

```bash
php artisan migrate --force
php artisan test --filter=HealthEndpointTest
```

Rollback application code first. Roll back database changes only when the migration `down()` path is known to be safe for the affected release.

## Redis

Use persistent Redis for production. Configure an eviction policy that does not drop queue jobs unexpectedly; the compose default uses `noeviction`.

## Azure Blob Storage

Create one private container for CRM uploads and exports. Grant access through account credentials or a managed secret provider. Configure:

```env
AZURE_STORAGE_ACCOUNT_NAME=<account>
AZURE_STORAGE_ACCOUNT_KEY=<key>
AZURE_STORAGE_CONTAINER=<container>
AZURE_STORAGE_URL=https://<account>.blob.core.windows.net
```

Workspace logos and report exports are written by Laravel through `App\Services\AzureBlobService`. WhatsApp message media remains gateway-owned and is tracked with provider/path/url metadata in `message_media`.
