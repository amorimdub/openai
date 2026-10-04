#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container_cli="${CONTAINER_CLI:-/opt/homebrew/bin/container}"
if inspection="$("$container_cli" inspect ireland-map-postgis 2>/dev/null)"; then
  state="$(printf '%s' "$inspection" | bun -e 'console.log(JSON.parse(await Bun.stdin.text())[0].status.state)')"
  case "$state" in
    running) ;;
    stopped) "$container_cli" start ireland-map-postgis ;;
    *) printf 'Database container has unexpected state: %s\n' "$state" >&2; exit 1 ;;
  esac
else
  if ! "$container_cli" volume inspect ireland-map-postgis-data >/dev/null 2>&1; then
    "$container_cli" volume create ireland-map-postgis-data
  fi
  "$container_cli" run --detach --name ireland-map-postgis --platform linux/amd64 --rosetta \
    --cpus 2 --memory 2G --publish 127.0.0.1:55439:5432 \
    --env PGDATA=/var/lib/postgresql/data/pgdata --env POSTGRES_USER=ireland --env POSTGRES_DB=ireland --env POSTGRES_HOST_AUTH_METHOD=trust \
    --volume "ireland-map-postgis-data:/var/lib/postgresql/data" postgis/postgis:17-3.5
fi
for attempt in {1..30}; do
  if "$container_cli" exec ireland-map-postgis pg_isready -U ireland -d ireland >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done
printf 'Database did not become ready within 30 checks; inspect container logs.\n' >&2
exit 1
