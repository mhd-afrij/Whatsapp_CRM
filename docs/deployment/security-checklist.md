# Security Checklist

## Laravel API

- Sanctum authentication is required for all `/api/v1` routes except health, login, password reset, and invitation acceptance.
- Permission middleware must be present on every privileged route. Any route added under `backend/routes/api.php` needs a matching permission test.
- Uploads must validate MIME type and size before storage. Current media upload limits are 25 MB for message media and 2 MB for workspace logos.
- Production file storage uses private Supabase Storage (`whatsapp-media` bucket) accessed via signed temporary URLs.
- Rate limit login, password reset, invitation creation, search, exports, and gateway-facing actions.
- Never return raw storage credentials, secret keys, or database passwords in API responses.

## WhatsApp Gateway

- All internal gateway routes require `X-Internal-Gateway-Token` and compare tokens with timing-safe equality.
- Gateway credentials are encrypted at rest with AES-256-GCM in PostgreSQL via `whatsapp_session_credentials`; local auth files are ephemeral runtime caches only.
- Reconnects use bounded exponential backoff and record connection events for diagnosis.
- Outbound media download and message processing go through `pg-boss` (PostgreSQL queues) with retry and terminal failure recording.
- Gateway-owned WhatsApp tables must not be modified directly except through internal APIs.

## Database And Operations

- Run `scripts/postgres-backup.sh` before production migrations and before WhatsApp reset operations.
- Test restore with `scripts/postgres-restore.sh <dump.sql.gz> [target_db]` on a staging database before relying on backups.
- Store database backup files outside the application container filesystem in persistent cloud storage.
- Roll back with `php artisan migrate:rollback --step=1` only after verifying migration reversibility.
