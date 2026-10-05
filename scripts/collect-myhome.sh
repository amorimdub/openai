#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec bun run src/listings/cli.ts --provider myhome --all --out data/raw/property-listings/myhome "$@"
