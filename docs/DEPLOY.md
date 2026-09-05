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

## Newsroom domains

Every account's public newsroom is reachable three ways. The middleware (`src/middleware.ts`) decides by request host, using the pure `resolveHost()` in `src/lib/newsroom/host.ts`:

1. **Path**: `https://app.example.com/n/<slug>/...` always works, no DNS needed.
2. **Subdomain**: `https://<slug>.<NEWSROOM_DOMAIN>/...` is rewritten to `/n/<slug>/...`. Set `NEWSROOM_DOMAIN=newsroom.example.com`, add a wildcard DNS record `*.newsroom.example.com` pointing at the app, and issue a wildcard certificate (Caddy with a DNS-01 challenge, or `fly certs add "*.newsroom.example.com"`). Locally the default `newsroom.localhost` works in Chrome and Firefox without any setup: `http://demo.newsroom.localhost:3000`.
3. **Custom domain**: an admin saves `news.customer.com` under Settings > Newsroom, creates a CNAME to `<slug>.<NEWSROOM_DOMAIN>` (or to the app host when `NEWSROOM_DOMAIN` is the localhost default) and clicks Verify. Verification resolves the CNAME (or falls back to comparing A records with the app host) and stamps `NewsroomSettings.domainVerifiedAt`. Unknown or unverified hosts are rewritten to `/n/_host/<host>/...` and 404.

TLS for custom domains has to be issued at the edge, because certificates are per hostname:

- **Caddy**: enable on-demand TLS and point the `ask` endpoint at the app so Caddy only issues certificates for verified domains.
  ```
  {
    on_demand_tls { ask https://app.example.com/api/newsroom/domain-check }
  }
  https:// {
    tls { on_demand }
    reverse_proxy app:3000
  }
  ```
  (`/api/newsroom/domain-check` is not built yet: it should return 200 when `NewsroomSettings.customDomain` matches the `domain` query parameter and `domainVerifiedAt` is set, else 404.)
- **Fly.io**: `fly certs add news.customer.com` after the customer's CNAME is in place; Fly validates and issues the certificate. Automate it from the Verify action if you run there.
- Always forward the original host (`X-Forwarded-Host`) to the app; the middleware reads it before `Host`.
