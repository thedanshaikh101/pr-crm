#!/bin/sh
# Web process: apply migrations, optionally seed the demo workspace, start Next.
set -e
cd "$(dirname "$0")/.."
. ./scripts/env.sh
echo "[start] APP_URL=$APP_URL"
npx prisma migrate deploy
if [ "$SEED_DEMO" = "1" ]; then
  echo "[start] SEED_DEMO=1: seeding demo workspace (skips if it already exists)"
  npx tsx prisma/seed.ts || echo "[start] seed skipped or failed; continuing"
fi
exec npx next start -p "${PORT:-3000}"
