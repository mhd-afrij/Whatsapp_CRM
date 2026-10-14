#!/usr/bin/env bash
# MySQL restore for the CRM-WhatsApp database, from a dump produced by
# mysql-backup.sh (a gzip-compressed .sql.gz file).
#
# Usage:
#   ./infrastructure/scripts/mysql-restore.sh <path-to-dump.sql.gz> [target-db-name]
#
# By default restores into DB_DATABASE (or crm_whatsapp). Pass a second
# argument to restore into a different (e.g. scratch/test) database instead -
# useful for verifying a backup without touching the real database.
#
# Reads the same DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD env vars as
# mysql-backup.sh.

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path-to-dump.sql.gz> [target-db-name]" >&2
  exit 1
fi

DUMP_FILE="$1"
TEMP_DOWNLOADED=""

# If path is an azure:// URI or starts with "blob:", download from Azure first
if [[ "${DUMP_FILE}" =~ ^azure://([^/]+)/(.+)$ ]]; then
  CONTAINER="${BASH_REMATCH[1]}"
  BLOB="${BASH_REMATCH[2]}"
  TEMP_DOWNLOADED="/tmp/azure_restore_$(date +%s).sql.gz"
  echo "Downloading dump from Azure container '${CONTAINER}' blob '${BLOB}'..."
  if [ -n "${AZURE_STORAGE_CONNECTION_STRING:-}" ]; then
    az storage blob download \
      --connection-string "${AZURE_STORAGE_CONNECTION_STRING}" \
      --container-name "${CONTAINER}" \
      --name "${BLOB}" \
      --file "${TEMP_DOWNLOADED}"
  else
    az storage blob download \
      --account-name "${AZURE_STORAGE_ACCOUNT_NAME}" \
      --account-key "${AZURE_STORAGE_ACCOUNT_KEY}" \
      --container-name "${CONTAINER}" \
      --name "${BLOB}" \
      --file "${TEMP_DOWNLOADED}"
  fi
  DUMP_FILE="${TEMP_DOWNLOADED}"
fi

if [ ! -f "${DUMP_FILE}" ]; then
  echo "ERROR: dump file not found: ${DUMP_FILE}" >&2
  exit 1
fi

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USERNAME="${DB_USERNAME:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
TARGET_DB="${2:-${DB_DATABASE:-crm_whatsapp}}"

MYSQL_BIN="${MYSQL_BIN:-mysql}"

echo "Restoring '${DUMP_FILE}' into database '${TARGET_DB}' on ${DB_HOST}:${DB_PORT}"

MYSQL_PWD="${DB_PASSWORD}" "${MYSQL_BIN}" \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USERNAME}" \
  -e "CREATE DATABASE IF NOT EXISTS \`${TARGET_DB}\`;"

gunzip -c "${DUMP_FILE}" | MYSQL_PWD="${DB_PASSWORD}" "${MYSQL_BIN}" \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USERNAME}" \
  "${TARGET_DB}"

echo "Restore complete into '${TARGET_DB}'."

if [ -n "${TEMP_DOWNLOADED}" ] && [ -f "${TEMP_DOWNLOADED}" ]; then
  rm -f "${TEMP_DOWNLOADED}"
fi
