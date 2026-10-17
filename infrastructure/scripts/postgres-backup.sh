#!/usr/bin/env bash
# PostgreSQL backup for the CRM-WhatsApp database (Supabase PostgreSQL).
#
# Usage:
#   ./infrastructure/scripts/postgres-backup.sh [output-dir]
#
# Reads connection info from environment variables:
#   DB_HOST      (default: 127.0.0.1)
#   DB_PORT      (default: 5432)
#   DB_DATABASE  (default: postgres)
#   DB_USERNAME  (default: postgres)
#   DB_PASSWORD  (default: empty)
#
# Produces a single timestamped, gzip-compressed SQL dump per run:
#   <output-dir>/<database>_YYYYmmdd_HHMMSS.sql.gz
#
# Exits non-zero (and leaves no partial file behind) on any failure.

set -euo pipefail

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_DATABASE="${DB_DATABASE:-postgres}"
DB_USERNAME="${DB_USERNAME:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"

OUTPUT_DIR="${1:-$(dirname "$0")/../../storage/backups}"
mkdir -p "$OUTPUT_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_FILE="${OUTPUT_DIR}/${DB_DATABASE}_${TIMESTAMP}.sql.gz"
TMP_FILE="${DUMP_FILE}.tmp"

PGDUMP_BIN="${PGDUMP_BIN:-pg_dump}"

echo "Backing up database '${DB_DATABASE}' from ${DB_HOST}:${DB_PORT} -> ${DUMP_FILE}"

PGPASSWORD="${DB_PASSWORD}" "${PGDUMP_BIN}" \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USERNAME}" \
  --no-owner \
  --no-privileges \
  "${DB_DATABASE}" \
  | gzip > "${TMP_FILE}"

mv "${TMP_FILE}" "${DUMP_FILE}"

SIZE_BYTES=$(wc -c < "${DUMP_FILE}")
if [ "${SIZE_BYTES}" -eq 0 ]; then
  echo "ERROR: backup file is empty, something went wrong." >&2
  rm -f "${DUMP_FILE}"
  exit 1
fi

echo "Backup completed successfully (${SIZE_BYTES} bytes): ${DUMP_FILE}"

