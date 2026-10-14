#!/usr/bin/env bash
# =============================================================================
# Render entrypoint for the Laravel backend image.
# =============================================================================
# On docker-compose the backend runs everything side-by-side via docker/start.sh
# (HTTP server + queue worker + scheduler in one container). On Render each role
# runs as its own service so it can scale and restart independently, and so a
# crashing worker never takes the API down with it.
#
# Usage: render-entrypoint.sh <role>
#   web      -> HTTP API server           (crm-backend web service)
#   worker   -> Redis queue worker loop   (crm-worker background worker)
#   schedule -> one-shot scheduler tick   (crm-scheduler cron job)
#   migrate  -> pre-deploy migration hook (crm-backend preDeployCommand)
# =============================================================================
set -euo pipefail

role="${1:-web}"

# Fail loudly on inconsistent storage configuration (FILESYSTEM_DISK pointing
# at an undefined disk, or an azure disk without credentials) exactly like
# docker/start.sh does. Migrations do not touch storage, so they skip it.
if [ "$role" != "migrate" ]; then
  php artisan storage:verify
fi

case "$role" in
  web)
    # Render provides PORT (defaults to 10000); fall back to 8000 for parity
    # with docker-compose when the variable is unset.
    exec php artisan serve --host=0.0.0.0 --port="${PORT:-8000}"
    ;;

  worker)
    # Restart loop instead of a bare worker: queue:work exits after --max-time
    # for memory hygiene; the loop keeps a worker available continuously.
    while true; do
      php artisan queue:work redis --sleep=1 --max-time=3600 --tries=3 || true
      sleep 1
    done
    ;;

  schedule)
    # One-shot used by a Render cron job (schedule: '* * * * *').
    exec php artisan schedule:run
    ;;

  migrate)
    # Pre-deploy hook. On the very first deploy the MySQL private service can
    # still be starting up, so retry a few times instead of failing the deploy.
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
