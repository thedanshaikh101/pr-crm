# Changelog

## 0.2.0 (steps 2 to 9: every module)

Built on top of 0.1.0:
- Press Releases: card and table list with filters, saved state and per-release stats; editor with autosave, versions and restore, boilerplate, footer and media contact pickers, featured image upload, attachments from the library, tags, client, proactivity, embargo, slug; preview for Gmail, Outlook and mobile in a sandboxed iframe; right-rail badges; duplicate, archive, delete.
- Email engine: table-based email renderer, newsroom and print renderers; distribution flow with lists, smart groups, individual contacts and ad hoc addresses, dedupe and no-valid-email counts, suppression list, verified from-domains only, wrapper compose with merge fields and teaser mode, test send, send now or schedule in the account timezone, cancel while queued; sends worker with per-account throttle, tracked links `/t/<code>`, open pixel `/o/<id>`, `List-Unsubscribe` and one-click `/u/<id>`, usage counters, release goes live on completion; reply detection through an inbound webhook and an optional IMAP poller; per-recipient tracking table with openers, non-openers, clickers and bounced filters and one-click list creation.
- Newsletters: same engine with a block editor (heading, text, image, release, button, divider) rendered to email-safe HTML.
- Sending Domains: create at the provider, DNS records with copy buttons, verify, default from address.
- Public Newsroom: `/n/<slug>` and `<slug>.NEWSROOM_DOMAIN`, verified custom domains via CNAME, themed layout, search, tags, release pages with OG tags, JSON-LD, print view, assets and share links, short links `/r/<code>`, RSS, media kit, about page, pageview tracking.
- Resource Library: folders, direct-to-storage uploads (S3 presigned or local disk), video links, kinds, tags, media kit flag, public links, usage, soft delete and restore, storage total.
- Coverage: card and table views, filter drawer with saved views, add from URL with title, outlet, date, image and author extraction, paste-in URL lists, pickups, CSV export, per-client PDF report with logo, webhook `coverage.created`.
- Dashboard: Need to Know report as a Word document.
- Settings and Billing: Stripe Checkout, Customer Portal, invoices, cancel and resume, trial with card on file, webhook sync, usage meters; Clients; Tag Groups; Case and Topic Types; Contact Classifications; Email Footers and Boilerplates; Newsroom settings; API keys and webhook endpoints with signed deliveries, retries and a delivery log; GDPR search, export and purge; Deleted Items with 30-day restore; nightly hard delete, retention policy, trial expiry and statement expiry jobs; Google sign-in.
- Planning and Analysis: calendar month and week views with drag to reschedule, awareness days import, virtual release, deadline and interview items; Recharts dashboards with PNG and CSV export; Your Hard Work, Contact Report and Tag Report with CSV.
- Response Desk: At a glance, Topics, Conversations with notes thread, status stepper, reply and attachments, Interview Requests with proposed times and calendar sync, Statements with versions and approval, Activities, Themes, File Attachments; shared inbox webhook and IMAP poller that open conversations.
- Super-admin: accounts table with MRR, usage, bounce and complaint rates, account page with feature flags, suspend, plan override, retention and throttle, impersonation with an exit bar, status page with queue depths and health, `/api/healthz`.
- API: `/api/v1` for contacts, lists, releases and coverage with an OpenAPI document and HTML docs; per-key rate limits.
- Cross-cutting: Redis rate limiter with in-memory fallback; import rollback restores updated contacts; imports over 5,000 rows stage to storage and run in the worker; nightly email verification (syntax, MX, optional SMTP); RSS ingestion for contact content; column drag and resize persisted per user; focus traps, keyboard row navigation and live announcements; card view on narrow screens; mobile navigation.
- Tests: 193 across 23 files.

## 0.1.0 (step 1 of 9: foundation + Contacts)

Built:
- Full data model for every module (accounts, users, memberships, sessions, tokens, invitations, API keys, webhooks, audit log, usage counters, organizations, contacts, subjects taxonomy, tags, notes, lists, list members, smart groups, saved views, column layouts, imports, clients, releases, release versions, boilerplates, folders, assets, newsroom settings, pageviews, sending domains, distributions, recipients, email events, suppressions, tracked links, coverage, response desk tables, calendar events).
- Auth: email + password, email verification, magic link, password reset, sessions (DB-backed, httpOnly cookie), invite-by-email with roles, rate limiting, audit log, super-admin flag, impersonation-aware viewer resolver, account switching.
- Tenancy: `requireViewer()` + `accountId` on every query; role gates; plan-limit asserts for contacts, users, emails.
- Global shell: dark left rail (quick-add, settings, help, log out, avatar), top nav with all module dropdowns, ⌘K global search across contacts, organizations, lists, releases, coverage.
- Contacts: Media Contacts table with default + hidden columns, reorderable/toggleable per-user column layout, 25/50/100/250 paging, sort options, Subjects and In-List popovers, bulk bar (Add to List, Smart Group, Export CSV, Tag, Delete), card view, floating + button.
- Filter drawer with every filter in the spec; AND across groups, OR within; state in URL; saved views.
- Contact record: two-column layout, header with inline edit, About, Activity tabs (Recent Content, Contacts activity, Response Desk, Coverage, Timeline), Notes, At a glance, Reach, Associated Organizations, Lists, Export, Report inaccuracy, Merge duplicate, Delete (soft).
- Organizations: list, record with people table, editable details, merge tool.
- My Contacts view (owned or emailed).
- Lists: gallery cards with Hygiene %, Engagement In, member count, last distribution; Smart Groups from saved filters; list detail with Engagement Out/In, hygiene bar, member table, bulk remove, duplicate, merge, delete, export.
- Imports: CSV/XLSX/paste/Google Sheet, header auto-detect tuned to Onclusive and Canadian Press exports, mapping screen with samples, dedupe preview (email then name+outlet), update-or-skip, add to new/existing list, history with counts, errors CSV, rollback.
- In-Article Search: fetch URL, extract byline/outlet/title from meta tags and JSON-LD, match to contacts, prefill new contact.
- Data hygiene: significant-update flag on outlet/title change, ex-journalist flag hidden by default, bounce/complaint/unsubscribe webhook handling flags emails and writes the suppression list.
- Dashboard: greeting, last sign-in, 10-day activity chart (Total vs Me), weekly counts panel, To Do, Coming Up, Need to Know download (text for now).
- Settings: Team Management (cards, invite, role change, deactivate, seat count), My Settings (profile, timezone, notifications, password, usage meters), My Contact Information.
- API: `GET/POST /api/v1/contacts` with API-key auth; export CSV endpoint; Resend webhook with Svix signature check; Stripe subscription webhook.
- Email engine pieces: provider interface (console + Resend), merge fields with fallbacks, plain-text generation, event normalizer, event applier.
- Worker skeleton with queues and nightly verify schedule.
- Seed: demo account with 15 outlets, 180 contacts, 4 lists (2 smart), 4 releases with distribution stats, 14 coverage items, response desk items, tasks, calendar events.
- Tests: tenancy isolation, import dedupe and auto-map, email tracking webhooks, merge fields, billing limits (18 passing).
- Docker Compose (Postgres, Redis, MinIO, Mailpit, app, worker), Dockerfile, deploy guide.
