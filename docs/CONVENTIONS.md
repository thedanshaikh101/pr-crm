# Conventions (read before adding a module)

## Tenancy and auth
- Pages and server actions start with `const v = await requireViewer()` (`src/lib/auth.ts`). `v.account.id` is the only tenancy key.
- Every query on a tenant table includes `accountId: v.account.id`. Updates by id use `updateMany({ where: { id, accountId } })` or a `findFirst` guard first.
- Role gates: `requireRole(v, "EDITOR")` for writes, `"ADMIN"` for team/billing/danger, `"OWNER"` for ownership transfer. Super-admin screens check `v.user.isSuperAdmin`.
- Audit every write: `audit(accountId, userId, "entity.action", entity, entityId, meta)` (`src/lib/audit.ts`).
- Public routes (newsroom, tracking, webhooks) never use the session; they resolve the account from the URL (slug, short code, token) and are listed in `src/middleware.ts` PUBLIC.

## Code layout
- Server actions: `src/server/<module>.ts` with `"use server"` at the top; zod for input; `revalidatePath` after writes; `redirect` after create.
- Pages: `src/app/(app)/<module>/...` async server components. Client components only where interaction needs state (`"use client"`), under `src/components/<module>/`.
- Pure logic (filters, renderers, parsers, calculators) in `src/lib/<module>/` so it unit-tests without a DB. Add tests in `tests/<module>.test.ts` (vitest, node env).
- Background jobs: `src/worker/jobs/<module>.ts` exporting a `JobModule` (see `jobs/types.ts`); register it in `src/worker/index.ts` MODULES. Enqueue from the app with `enqueue()` from `src/lib/queue.ts`.
- Files: `src/lib/storage.ts` (`putObject`, `getObject`, `presignedPut`, `urlFor`, `newStorageKey`). Never touch the filesystem or S3 SDK directly.
- Rich text: `<RichTextEditor name="body" defaultValue={html} />` submits HTML in the form; sanitize on save with `cleanHtml()` (`src/lib/html.ts`) and render with `dangerouslySetInnerHTML` only after sanitizing.
- Seed: `prisma/seed/<module>.ts` exporting a `SeedModule`; register in `prisma/seed.ts` MODULES. Seeders must be idempotent enough to run once on a fresh DB.
- Plan limits live in `src/lib/plans.ts`; enforce with the `assert*Capacity` helpers.

## UI
- Tailwind with the classes in `globals.css`: `.btn`, `.btn-primary`, `.btn-danger`, `.input`, `.label`, `.card`, `.chip`, `.pill`, `table.data`.
- List screens: heading row with actions on the right, `ListToolbar` for search/filters/paging when the list is big, table or card view, empty state card with one call to action, floating `+` bottom-right for the primary create action.
- Detail screens: `← Back` button, title, `⋯` menu (`<details>`) for secondary actions, two-column grid on `lg`.
- Forms: server-action `<form action={...}>`; labels on every input; errors as plain text near the field.
- Status pills: DRAFT neutral, SCHEDULED warn, LIVE/SENT good, FAILED/CANCELLED bad.
- Copy is plain English, no exclamation marks, no lorem in UI strings. Dates through `toLocaleDateString()` / `toLocaleString()`.
- Accessibility: every icon-only button has `aria-label`; dialogs have `role="dialog"` and close on Escape; tables have header cells.
