# TODO (in build order from the spec, section 13)

## Step 2: Email engine + Press Releases
- [ ] Release list (cards + table), editor page (rich text: use Tiptap), boilerplate/footer pickers, featured image, attachments, tags, client
- [ ] Autosave drafts, `ReleaseVersion` history, duplicate
- [ ] Preview toggle (email / newsroom / mobile); right-rail badges
- [ ] Distribution flow: recipient picker (lists + contacts + ad hoc), dedupe count, no-valid-email count; wrapper compose; test send; schedule; Proactive/Reactive
- [ ] Sends worker: honour `Suppression`, merge fields, `List-Unsubscribe` + one-click header, link rewriting to `/t/<code>` (`TrackedLink`), open pixel route `/o/<recipientId>`, per-account throttle, cancel while queued, `UsageCounter` increment
- [ ] Reply detection: reply-to inbox parsing (Resend inbound or IMAP) → `repliedAt`
- [ ] Detail side panel: stats tiles, distributions list, per-recipient table, one-click "openers" / "non-openers" list
- [ ] Sending Domains settings: create via provider, show DNS records, verify, refuse unverified from-addresses
- [ ] Email preview widths (Gmail/Outlook/mobile) as iframe sandbox
- [ ] Newsletters: block layout on top of the release engine

## Step 3: Public Newsroom + Resource Library
- [ ] `{slug}.NEWSROOM_DOMAIN` routing via middleware host match; custom domain (CNAME) + SSL (Caddy or Fly certs)
- [ ] Release page with OG tags, print view, short link `/r/<shortCode>`, assets section, pageview tracking
- [ ] RSS feed, search, tags, media kit page, media contact block, theme settings
- [ ] Resource Library: S3 upload (presigned), folders, tags, usage tracking, public asset links

## Step 4: Coverage
- [ ] Card + table views, add from URL (auto-fetch title/outlet/date/image), link from release panel, pickups, filters, CSV + PDF report (per client, with logo), paste-in URL list

## Step 5: Dashboard polish
- [ ] Need to Know as .docx (`docx` npm package) instead of text

## Step 6: Settings + Billing
- [ ] Stripe Checkout, Customer Portal, invoices, cancel; trial with card on file; usage meters
- [ ] Tag Groups, Case/Topic Types, Contact Classifications (account-extendable list is modelled; UI missing)
- [ ] Email Footers & Boilerplates UI (model exists)
- [ ] Newsroom settings UI, API keys + Webhooks UI (models exist; `WebhookDelivery` retry worker)
- [ ] GDPR Data Clean: search a person across all tables; export JSON; purge
- [ ] Deleted Items: 30-day bin listing + restore; nightly hard-delete job; retention policy job
- [ ] Google sign-in (OAuth route handlers; `User.googleId` exists)

## Step 7: Planning and Analysis
- [ ] Calendar month/week, drag to reschedule (`CalendarEvent` + release scheduledFor)
- [ ] Charts (Recharts) with date range + client filter, PNG/CSV export
- [ ] Your Hard Work, Contact Report, Tag Report

## Step 8: Response Desk
- [ ] Topics, Conversations (+ notes thread), Interview Requests, Statements (+ versions, approval), Activities, Themes, At a glance, File Attachments
- [ ] Optional shared inbox (Gmail / M365) → Conversations

## Step 9: Super-admin
- [ ] `/admin`: accounts table, MRR, usage, bounce/complaint rates, suspend, impersonate (write `Session.impersonatedBy`), feature flags, status page (queue depth, provider health)

## Cross-cutting
- [ ] OpenAPI spec for `/api/v1` (contacts, lists, releases, coverage) and webhook events
- [ ] Contact page: reorder/resize persisted to `ColumnLayout` on drag (currently via the checklist popover)
- [ ] Import rollback only removes created contacts; updated contacts are not reverted (store pre-update snapshot per row)
- [ ] Large imports (>5k rows) should stage `rawRows` in S3 and run in the imports worker, not inline
- [ ] Nightly email verification (syntax + MX; optional SMTP) in the verify worker
- [ ] RSS ingestion for `ContentItem` (Recent Content tab)
- [ ] Rate limiter: move from in-memory map to Redis
- [ ] Accessibility pass: focus trap in the filter drawer and search modal; arrow-key row navigation
- [ ] Mobile: table → card auto-degrade below 768px (view toggle exists; make it automatic)
