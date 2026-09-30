#!/usr/bin/env bash
# Container entrypoint: runs the API server, a Redis queue worker, and the
# task scheduler side-by-side. Without the worker, queued jobs (campaign
# sends, report exports) pile up unprocessed; without the scheduler,
# scheduled campaigns/task reminders/SLA checks never fire.
set -u

shutdown() {
    # Forward TERM/SINT to every child so `docker compose stop` is quick.
    local pids
    pids=$(jobs -p)
    [ -n "$pids" ] && kill -TERM $pids 2>/dev/null
    wait
}
trap shutdown TERM INT

# Refuse to boot on inconsistent storage configuration (missing azure
# credential, FILESYSTEM_DISK pointing at an undefined disk). Running anyway
# would look healthy while every upload fails, so fail loudly and early.
php artisan storage:verify || exit 1

php artisan serve --host=0.0.0.0 --port=8000 &

# Restart loop instead of a bare worker: queue:work exits after --max-time
# (memory hygiene); the loop keeps a worker available continuously.
(
    while true; do
        php artisan queue:work redis --sleep=1 --max-time=3600 || true
        sleep 1
    done
) &

php artisan schedule:work &

wait
