#!/usr/bin/env bash
# Container entrypoint: runs the API server, a database queue worker, and the
# task scheduler side-by-side.
set -u

shutdown() {
    local pids
    pids=$(jobs -p)
    [ -n "$pids" ] && kill -TERM $pids 2>/dev/null
    wait
}
trap shutdown TERM INT

# Verify storage configuration at boot time.
php artisan storage:verify || exit 1

port="${PORT:-8000}"
php artisan serve --host=0.0.0.0 --port="$port" &

# Restart loop for database queue worker
(
    while true; do
        php artisan queue:work database --sleep=1 --max-time=3600 || true
        sleep 1
    done
) &

php artisan schedule:work &

wait
