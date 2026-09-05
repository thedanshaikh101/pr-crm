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
npm run worker                  # in a second terminal
npm test
```

Or everything in containers: `docker compose up --build`.

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
src/lib/email/                provider abstraction, event normalizer, event applier
src/server/*.ts               server actions (contacts, auth, team, views)
src/app/(auth)                login, register, verify, reset
src/app/(app)                 authenticated app; layout renders the shell
src/app/api/v1                public REST API (Bearer API key)
src/app/api/webhooks          email provider + Stripe receivers
src/worker/index.ts           BullMQ workers
tests/                        vitest
docs/DEPLOY.md                production guide
```

See `CHANGELOG.md` for what is built and `TODO.md` for what is deferred, in build order.
