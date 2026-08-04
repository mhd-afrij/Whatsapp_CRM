#!/usr/bin/env bash
# MySQL backup for the CRM-WhatsApp database.
#
# Usage:
#   ./infrastructure/scripts/mysql-backup.sh [output-dir]
#
# Reads connection info from environment variables (matching the names used
# by backend/.env and docker-compose.yml), with sane local-dev defaults:
#   DB_HOST      (default: 127.0.0.1)
#   DB_PORT      (default: 3306)
#   DB_DATABASE  (default: crm_whatsapp)
#   DB_USERNAME  (default: root)
#   DB_PASSWORD  (default: empty)
#
# Produces a single timestamped, gzip-compressed SQL dump per run, so repeated
# runs never clobber each other and the workspace-wide backup history is easy
# to prune/rotate:
#   <output-dir>/crm_whatsapp_YYYYmmdd_HHMMSS.sql.gz
#
# Exits non-zero (and leaves no partial file behind) on any failure.

set -euo pipefail

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_DATABASE="${DB_DATABASE:-crm_whatsapp}"
DB_USERNAME="${DB_USERNAME:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"

OUTPUT_DIR="${1:-$(dirname "$0")/../../storage/backups}"
mkdir -p "$OUTPUT_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_FILE="${OUTPUT_DIR}/${DB_DATABASE}_${TIMESTAMP}.sql.gz"
TMP_FILE="${DUMP_FILE}.tmp"

MYSQLDUMP_BIN="${MYSQLDUMP_BIN:-mysqldump}"

echo "Backing up database '${DB_DATABASE}' from ${DB_HOST}:${DB_PORT} -> ${DUMP_FILE}"

MYSQL_PWD="${DB_PASSWORD}" "${MYSQLDUMP_BIN}" \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USERNAME}" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  "${DB_DATABASE}" \
  | gzip > "${TMP_FILE}"

mv "${TMP_FILE}" "${DUMP_FILE}"

SIZE_BYTES=$(wc -c < "${DUMP_FILE}")
if [ "${SIZE_BYTES}" -eq 0 ]; then
  echo "ERROR: backup file is empty, something went wrong." >&2
  rm -f "${DUMP_FILE}"
  exit 1
fi

echo "Backup complete: ${DUMP_FILE} (${SIZE_BYTES} bytes)"

# Note on what else production backups need to cover (not scripted here):
#   - MinIO/S3 media bucket contents (message attachments, exports) - use
#     `mc mirror` (MinIO client) or your cloud provider's bucket-replication /
#     versioning feature; this script only covers the relational database.
#   - .env secrets (APP_KEY, DB_PASSWORD, WHATSAPP_GATEWAY_TOKEN,
#     CREDENTIALS_ENCRYPTION_KEY, etc.) - these must NOT be included in any
#     backup artifact written to shared/long-lived storage. Manage them via a
#     secrets manager (Vault, AWS Secrets Manager, Doppler, etc.) with its own
#     backup/rotation story instead.
