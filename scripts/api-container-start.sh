#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container_cli="${CONTAINER_CLI:-/opt/homebrew/bin/container}"
if [[ "${SKIP_API_BUILD:-0}" != "1" ]]; then
  "$container_cli" build --file Containerfile.api --tag ireland-map-api:dev --platform linux/arm64 --progress plain .
fi
pg_address=$("$container_cli" inspect ireland-map-postgis | bun -e '
  const state=await Bun.stdin.json();
  if(state[0]?.status?.state!=="running") throw new Error("PostGIS container must be running");
  const address=state[0]?.status?.networks?.find(n=>n.network==="default")?.ipv4Address?.split("/")[0];
  if(!address || !/^[0-9.]+$/.test(address)) throw new Error("PostGIS container has no IPv4 address");
  console.log(address);
')
# Recreate this task's API container so a rebuilt image and current DB address take effect.
if "$container_cli" inspect ireland-map-api >/dev/null 2>&1; then
  "$container_cli" stop ireland-map-api >/dev/null 2>&1 || true
  "$container_cli" delete ireland-map-api
fi
"$container_cli" run --detach --name ireland-map-api --platform linux/arm64 \
  --cpus 2 --memory 1G --publish 127.0.0.1:3080:3000 \
  --env "CORS_ORIGINS=${CORS_ORIGINS:-}" \
  --env "DATABASE_URL=postgres://ireland@${pg_address}:5432/ireland" \
  ireland-map-api:dev
echo 'API: http://127.0.0.1:3080'
