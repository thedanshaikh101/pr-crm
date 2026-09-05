# Pressdesk

Self-hosted, multi-tenant PR management: media contact CRM, press release distribution, coverage tracking, response desk. Working name; rename in `package.json`, `src/app/layout.tsx`, and the auth pages.

## Stack and why

- **Next.js 14 App Router + TypeScript**: server components for the data-heavy list screens, server actions for mutations (no separate API layer to keep in sync), route handlers for the public REST API and webhooks.
- **Postgres + Prisma**: relational data with row-level tenancy via `accountId` on every table. `pg_trgm` + GIN indexes for sub-300ms contact search; `citext` for case-insensitive emails.
- **Tailwind**: fast, consistent, no component-library lock-in.
- **BullMQ + Redis**: sends, imports, nightly verification, reports.
- **Resend behind an interface** (`src/lib/email/provider.ts`): swap to SendGrid/Postmark by implementing four methods. `EMAIL_PROVIDER=console` logs instead of sending, so local dev needs no keys.
- **Stripe** for billing; plan limits live in `src/lib/plans.ts` and are enforced in server actions and the API.
- **S3-compatible storage** (MinIO locally) for the Resource Library.

## Run it

```bash
cp .env.example .env            # edit SESSION_SECRET at minimum
docker compose up -d db redis minio mailpit
npm install                     # runs prisma generate
npx prisma migrate dev --name init   # creates the schema; then 0002 adds search indexes
npm run db:seed                 # demo account: demo@pressdesk.local / demo-password-1
npm run dev                     # http://localhost:3000
npm run worker                  # in a second terminal (sends, webhooks, imports, verification, RSS, housekeeping)
npm test
```

Demo sign-ins after seeding: `demo@pressdesk.local` (owner, super-admin) and `sam@pressdesk.local` (editor) on the Northstar Communications workspace, `owner2@pressdesk.local` on Second Agency, all with `demo-password-1`. The seed prints a demo API key for `/api/v1`.

Optional integrations are all off until their env vars are set: Resend (`EMAIL_PROVIDER=resend`), Stripe, Google sign-in, S3 (`STORAGE_DRIVER=s3`), IMAP reply detection, the Response Desk shared inbox, and SMTP email verification. See `.env.example`.

Or everything in containers: `docker compose up --build`.

## Host it

The quickest hosted setup is Render: `render.yaml` creates the app, worker, Postgres and Redis from this repo in one Blueprint. Step by step in `docs/DEPLOY.md`, Option C. The same Docker image (`Dockerfile`, started by `scripts/start.sh` for the web and `scripts/worker.sh` for the worker) also runs on Railway, Fly.io or any VPS with Docker Compose.

## Tenancy rules (read before writing any query)

1. Every page and server action starts with `const v = await requireViewer()`. `v.account.id` is the only tenancy key.
2. Every Prisma query on a tenant table includes `accountId: v.account.id` in `where`. For updates by id, use `updateMany` with `{ id, accountId }` or `findFirst` first.
3. Filter builders are pure functions that take `accountId` as an argument and pin it as the first `AND` clause (`tests/tenancy.test.ts`).
4. Role gates: `requireRole(v, "EDITOR")` for writes, `"ADMIN"` for team/billing/rollback, `"OWNER"` for ownership transfer.
5. Audit every write with `audit(...)`.

## Layout

```
prisma/schema.prisma          full data model, all modules
prisma/seed.ts                demo data
src/lib/auth.ts               sessions, tokens, tenancy resolver, plan-limit asserts, rate limit
src/lib/plans.ts              plan limits (edit here)
src/lib/contacts/filters.ts   URL <-> filter state <-> Prisma where
src/lib/contacts/import.ts    parse, auto-map, normalize, dedupe (pure)
src/lib/email/                provider abstraction, event normalizer, event applier, reply matching
src/lib/releases/             release filters, renderers (email, newsroom, print), blocks, recipients
src/lib/newsroom/, library/   public newsroom data, RSS, host resolution; asset kinds and queries
src/lib/coverage/, planning/  coverage filters and metadata extraction; calendar, charts, reports
src/lib/reports/              coverage PDF (pdf-lib) and Need to Know docx
src/lib/settings/, billing/   webhooks (emit, sign, deliver), Stripe sync
src/lib/responseDesk/         SLA, statements, inbox normalisation
src/lib/api/                  API key handler, pagination, zod schemas, OpenAPI document
src/lib/storage.ts, queue.ts  object storage (S3 or local disk) and BullMQ queues
src/server/*.ts               server actions per module
src/app/(auth)                login, register, verify, reset, Google sign-in
src/app/(app)                 authenticated app; layout renders the shell
src/app/n, r, o, t, u         public newsroom, short links, open pixel, tracked links, unsubscribe
src/app/api/v1                public REST API (Bearer API key) and /api/v1/openapi.json
src/app/api/webhooks          email provider, inbound reply, inbox, Stripe receivers
src/worker/index.ts           BullMQ worker; one JobModule per file under src/worker/jobs
prisma/seed.ts + seed/        demo data, one seeder per module
tests/                        vitest (pure logic only, no DB)
docs/DEPLOY.md                production guide; docs/CONVENTIONS.md before adding code
```

See `CHANGELOG.md` for what is built and `TODO.md` for what is still open.
