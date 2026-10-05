#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec bun run src/listings/cli.ts --provider daft --all --out data/raw/property-listings/daft "$@"
