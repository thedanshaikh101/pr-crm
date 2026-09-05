# Changelog

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
