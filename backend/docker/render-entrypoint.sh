#!/usr/bin/env bash
# =============================================================================
# Render entrypoint for the Laravel backend image.
# =============================================================================
# On Render Free tier, web + background database worker + scheduler can run
# together in the web container or individually if configured.
#
# Usage: render-entrypoint.sh <role>
#   web      -> HTTP API server + background worker (crm-backend web service)
#   worker   -> Database queue worker loop (crm-worker background worker)
#   schedule -> one-shot scheduler tick (crm-scheduler cron job)
#   migrate  -> pre-deploy migration hook (crm-backend preDeployCommand)
# =============================================================================
set -euo pipefail

role="${1:-web}"

# Fail loudly on inconsistent storage configuration
if [ "$role" != "migrate" ]; then
  php artisan storage:verify
fi

case "$role" in
  web)
    # Start database queue worker in background to ensure queued tasks run on Render Free
    (
      while true; do
        php artisan queue:work database --sleep=1 --max-time=3600 --tries=3 || true
        sleep 1
      done
    ) &

    # Render provides PORT (defaults to 10000); fall back to 8000 when unset
    exec php artisan serve --host=0.0.0.0 --port="${PORT:-8000}"
    ;;

  worker)
    # Standalone database queue worker
    while true; do
      php artisan queue:work database --sleep=1 --max-time=3600 --tries=3 || true
      sleep 1
    done
    ;;

  schedule)
    exec php artisan schedule:run
    ;;

  migrate)
    attempts=6
    for attempt in $(seq 1 "$attempts"); do
      if php artisan migrate --force; then
        exit 0
      fi
      echo "migrate failed (attempt ${attempt}/${attempts}); retrying in 10s..." >&2
      sleep 10
    done
    echo "migrations did not succeed after ${attempts} attempts" >&2
    exit 1
    ;;

  *)
    echo "Unknown role '${role}' (expected: web|worker|schedule|migrate)" >&2
    exit 1
    ;;
esac
