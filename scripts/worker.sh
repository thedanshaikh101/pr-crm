#!/bin/sh
# Background worker process (sends, webhooks, imports, verification, RSS, housekeeping).
set -e
cd "$(dirname "$0")/.."
. ./scripts/env.sh
exec npx tsx src/worker/index.ts
