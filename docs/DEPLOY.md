# Production deploy

## Option C: Render, no server to manage (recommended if you just want it hosted)

`render.yaml` in the repo root describes everything: the web app, the background worker, a Postgres database and a Redis instance.

1. Sign up at render.com and connect your GitHub account.
2. Click **New +** then **Blueprint**, pick the `pr-crm` repository and the branch that has the app, and click **Apply**.
3. Render asks for one value, `SUPERADMIN_EMAILS`: enter your email address. Everything else is generated.
4. Wait for the first deploy (about ten minutes). Open the web service; its URL looks like `https://pressdesk-xxxx.onrender.com`.
5. Copy that URL into the worker service's `APP_URL` environment variable (Render dashboard, pressdesk-worker, Environment) so tracked links and unsubscribe links in emails point at the right host. Save; the worker redeploys.
6. Sign in with the demo user (`demo@pressdesk.local` / `demo-password-1`) or register your own workspace. Once you have your own workspace, set `SEED_DEMO` to `0` on the web service.

Cost at the time of writing: two Starter services and a Basic Postgres, roughly 20 USD a month; Redis is on the free plan.

Going live with real email: set `EMAIL_PROVIDER=resend` and `RESEND_API_KEY` on both services, add `RESEND_WEBHOOK_SECRET` on the web service, and point a Resend webhook at `https://<your url>/api/webhooks/email`. Then add and verify a sending domain inside the app (Settings, Sending Domains).

Files: uploads are stored on the web service's disk. For large teams or large imports move to S3-compatible storage (Cloudflare R2 works): set `STORAGE_DRIVER=s3` plus the `S3_*` variables on both services.

Your own domain: add it under the web service's Settings, Custom Domains, then set `APP_URL` on both services to that URL. For newsroom subdomains add a wildcard domain such as `*.newsroom.yourdomain.com` and set `NEWSROOM_DOMAIN=newsroom.yourdomain.com`.


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
