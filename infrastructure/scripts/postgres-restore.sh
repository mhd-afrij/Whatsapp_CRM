#!/usr/bin/env bash
# PostgreSQL restore for the CRM-WhatsApp database, from a dump produced by
# postgres-backup.sh (a gzip-compressed .sql.gz file).
#
# Usage:
#   ./infrastructure/scripts/postgres-restore.sh <path-to-dump.sql.gz> [target-db-name]
#
# Reads the same DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD env vars as
# postgres-backup.sh.

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path-to-dump.sql.gz> [target-db-name]" >&2
  exit 1
fi

DUMP_FILE="$1"

if [ ! -f "${DUMP_FILE}" ]; then
  echo "ERROR: dump file not found: ${DUMP_FILE}" >&2
  exit 1
fi

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"
TARGET_DB="${2:-${DB_DATABASE:-postgres}}"

PSQL_BIN="${PSQL_BIN:-psql}"

echo "Restoring '${DUMP_FILE}' into database '${TARGET_DB}' on ${DB_HOST}:${DB_PORT}"

gunzip -c "${DUMP_FILE}" | PGPASSWORD="${DB_PASSWORD}" "${PSQL_BIN}" \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USERNAME}" \
  --dbname="${TARGET_DB}"

echo "Restore of '${DUMP_FILE}' into '${TARGET_DB}' completed successfully."

