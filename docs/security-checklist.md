# Security Checklist

## Laravel API

- Sanctum authentication is required for all `/api/v1` routes except health, login, password reset, and invitation acceptance.
- Permission middleware must be present on every privileged route. Any route added under `backend/routes/api.php` needs a matching permission test.
- Uploads must validate MIME type and size before storage. Current media upload limits are 25 MB for message media and 2 MB for workspace logos.
- Production file storage must use Azure Blob Storage with `AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_STORAGE_ACCOUNT_KEY`, `AZURE_STORAGE_CONTAINER`, and `AZURE_STORAGE_URL` configured.
- Rate limit login, password reset, invitation creation, search, exports, and gateway-facing actions.
- Never return raw storage credentials or account keys from API responses.

## WhatsApp Gateway

- All internal gateway routes require `X-Internal-Gateway-Token` and compare tokens with timing-safe equality.
- Gateway credentials are persisted encrypted in MySQL through `whatsapp_session_credentials`; local auth files are only runtime material.
- Reconnects use bounded exponential backoff and record connection events for diagnosis.
- Outbound messages go through BullMQ with retry and terminal failure recording.
- Gateway-owned WhatsApp tables must not be modified from Laravel except through explicit internal gateway APIs.

## Database And Operations

- Run `infrastructure/scripts/mysql-backup.sh` before production migrations and before WhatsApp reset operations.
- Roll back with `php artisan migrate:rollback --step=1` only after checking whether the migration is data-preserving.
- Store backup files outside the app container filesystem and encrypt off-site copies.
- Test restore with `infrastructure/scripts/mysql-restore.sh <dump.sql.gz> [target_db]` on a staging database before relying on backups.
