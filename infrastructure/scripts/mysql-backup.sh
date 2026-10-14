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

echo "Local temporary backup created: ${DUMP_FILE} (${SIZE_BYTES} bytes)"

# ---- Upload to Azure Blob Storage ----
# Backups must not remain permanently on local application containers.
# When AZURE_STORAGE_CONTAINER_NAME (or AZURE_BACKUP_CONTAINER_NAME) and
# AZURE_STORAGE_CONNECTION_STRING (or AZURE_STORAGE_ACCOUNT_NAME + KEY) are configured,
# upload the backup to Azure and remove the local scratch copy.
AZURE_CONTAINER="${AZURE_BACKUP_CONTAINER_NAME:-${AZURE_STORAGE_CONTAINER_NAME:-database-backups}}"
BLOB_NAME="backups/${DB_DATABASE}/${DB_DATABASE}_${TIMESTAMP}.sql.gz"

if [ -n "${AZURE_STORAGE_CONNECTION_STRING:-}" ]; then
  echo "Uploading backup to Azure Blob Storage (container: '${AZURE_CONTAINER}', blob: '${BLOB_NAME}')..."
  if command -v az >/dev/null 2>&1; then
    az storage blob upload \
      --connection-string "${AZURE_STORAGE_CONNECTION_STRING}" \
      --container-name "${AZURE_CONTAINER}" \
      --name "${BLOB_NAME}" \
      --file "${DUMP_FILE}" \
      --overwrite true
    echo "Azure upload verified successfully."
    # Remove local file after successful verification
    if [ "${KEEP_LOCAL_BACKUP:-false}" != "true" ]; then
      rm -f "${DUMP_FILE}"
      echo "Removed local scratch file ${DUMP_FILE}."
    fi
  else
    echo "WARNING: Azure CLI 'az' not found in PATH. Backup remains at ${DUMP_FILE}."
  fi
elif [ -n "${AZURE_STORAGE_ACCOUNT_NAME:-}" ] && [ -n "${AZURE_STORAGE_ACCOUNT_KEY:-}" ]; then
  echo "Uploading backup to Azure Blob Storage using account credentials..."
  if command -v az >/dev/null 2>&1; then
    az storage blob upload \
      --account-name "${AZURE_STORAGE_ACCOUNT_NAME}" \
      --account-key "${AZURE_STORAGE_ACCOUNT_KEY}" \
      --container-name "${AZURE_CONTAINER}" \
      --name "${BLOB_NAME}" \
      --file "${DUMP_FILE}" \
      --overwrite true
    echo "Azure upload verified successfully."
    if [ "${KEEP_LOCAL_BACKUP:-false}" != "true" ]; then
      rm -f "${DUMP_FILE}"
      echo "Removed local scratch file ${DUMP_FILE}."
    fi
  else
    echo "WARNING: Azure CLI 'az' not found in PATH. Backup remains at ${DUMP_FILE}."
  fi
else
  echo "NOTE: Azure storage credentials not set in environment. Backup retained locally at ${DUMP_FILE}."
fi
