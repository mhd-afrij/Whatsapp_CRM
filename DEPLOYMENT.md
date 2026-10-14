# Production deployment with Docker Compose

This application must be deployed as a complete Docker Compose stack. It requires
the Laravel backend, Next.js frontend, WhatsApp gateway, MySQL, Redis, and Nginx.

## Requirements

- Linux VPS or cloud VM with Docker Engine and Docker Compose
- At least 4 GB RAM recommended
- Persistent disk storage and database backups
- DNS pointing to the server
- HTTPS termination through a load balancer, host Nginx, Cloudflare, or supplied Nginx certificates

## Deploy

```bash
git clone YOUR_REPOSITORY_URL crm-whatsapp
cd crm-whatsapp
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
cp whatsapp-gateway/.env.example whatsapp-gateway/.env
```

Configure production values in the environment files. Use strong unique values for
database passwords and the shared secrets. The gateway and backend must use matching
`INTERNAL_SHARED_SECRET`, `INTERNAL_GATEWAY_TOKEN`, and `WHATSAPP_GATEWAY_TOKEN` values.
`CREDENTIALS_ENCRYPTION_KEY` must be a 64-character hexadecimal key.

Validate and start the production overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml config
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T backend php artisan migrate --force
```

## Verify

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
curl -f http://localhost/api/v1/health
curl -f http://localhost/healthz
curl -f http://localhost/
```

Then verify login, QR pairing, incoming and outgoing messages, Socket.IO reconnect,
media uploads, queue processing, and persistent WhatsApp sessions.

## Updates and logs

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T backend php artisan migrate --force
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --tail=200 backend whatsapp-gateway nginx
```

Back up MySQL, the gateway session volume, and media storage before upgrades.

## Deploy on Render

To run the same stack on Render (each service built from its Dockerfile, with
Render-managed TLS, networking, Redis and a disk-backed MySQL), see
[docs/render-deployment.md](docs/render-deployment.md) and the
[`render.yaml`](render.yaml) Blueprint.
