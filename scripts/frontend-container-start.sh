#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container_cli="${CONTAINER_CLI:-/opt/homebrew/bin/container}"
if [[ "${SKIP_FRONTEND_BUILD:-0}" != "1" ]]; then
  "$container_cli" build --file Containerfile.frontend --tag ireland-map-frontend:dev --platform linux/arm64 --progress plain .
fi
api_address=$("$container_cli" inspect ireland-map-api | bun -e '
 const state=await Bun.stdin.json();
 if(state[0]?.status?.state!=="running")throw new Error("API container must be running");
 const address=state[0]?.status?.networks?.find(n=>n.network==="default")?.ipv4Address?.split("/")[0];
 if(!address||!/^[0-9.]+$/.test(address))throw new Error("API container has no IPv4 address");
 console.log(address);
')
if "$container_cli" inspect ireland-map-frontend >/dev/null 2>&1; then
  "$container_cli" stop ireland-map-frontend >/dev/null 2>&1 || true
  "$container_cli" delete ireland-map-frontend
fi
"$container_cli" run --detach --name ireland-map-frontend --platform linux/arm64 \
 --cpus 1 --memory 512M --publish 127.0.0.1:5173:4173 \
 --env "API_URL=http://${api_address}:3000" ireland-map-frontend:dev
echo 'Frontend: http://127.0.0.1:5173'
