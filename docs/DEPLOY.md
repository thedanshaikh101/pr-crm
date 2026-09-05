# Production deploy

## Option A: single VPS (Hetzner/DigitalOcean, 4 GB)

1. Install Docker + Compose. Clone the repo. `cp .env.example .env` and set real values (`SESSION_SECRET`, `APP_URL`, `EMAIL_PROVIDER=resend`, keys, S3).
2. Put Caddy in front for TLS and newsroom subdomains:
   ```
   app.example.com { reverse_proxy app:3000 }
   *.newsroom.example.com { reverse_proxy app:3000 }   # wildcard DNS + DNS-01 challenge
   ```
3. `docker compose up -d --build`. The app container runs `prisma migrate deploy` on start.
4. Backups: `docker exec db pg_dump -U pressdesk pressdesk | gzip > backup-$(date +%F).sql.gz` nightly via cron; ship to S3. MinIO data volume backed up the same way, or use a managed bucket.
5. Migrations: `npx prisma migrate dev --name <change>` locally, commit `prisma/migrations`, deploy; `migrate deploy` applies them.

## Option B: Fly.io / Railway

- App and worker as two processes from the same image (`node server.js` and `npx tsx src/worker/index.ts`).
- Managed Postgres and Redis. Set `DATABASE_URL`, `REDIS_URL`.
- Release command: `npx prisma migrate deploy`.
- Fly certs for `*.newsroom.example.com` and per-customer custom domains (`fly certs add`).

## Checklists

- Sending: verify at least one domain per account before enabling Live distributions; keep the platform bounce rate under 2% and complaints under 0.1%. Super-admin (step 9) surfaces per-account rates.
- Webhooks: point the provider at `https://app.example.com/api/webhooks/email`; set `RESEND_WEBHOOK_SECRET`. Stripe at `/api/webhooks/stripe`.
- Health: `GET /api/search?q=x` returns 401 quickly when the app is up; add a `/healthz` route in step 9 with queue depth.
