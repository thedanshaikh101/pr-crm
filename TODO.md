# TODO

Steps 1 to 9 of the spec are built (see `CHANGELOG.md`). What remains is polish and items that need a real external service to finish.

## Needs a live environment
- [ ] Send a real distribution through Resend end to end (the console provider was used locally) and confirm open, click, bounce and complaint webhooks land on `/api/webhooks/email`.
- [ ] Stripe: create the four prices, set `STRIPE_PRICE_*`, run a checkout in test mode, confirm the webhook keeps `Account.plan` in sync.
- [ ] Custom newsroom domains: on-demand TLS with Caddy (`docs/DEPLOY.md`); optionally add `/api/newsroom/domain-check` for Caddy's `ask` endpoint.
- [ ] Coverage "add from URL" and RSS ingestion against real sites (fixture-tested only; outbound HTTP was blocked in the build sandbox).

## Follow-ups
- [ ] Shared inbox: one mailbox per account (today one `INBOX_ACCOUNT_SLUG` for the IMAP poller; the webhook takes `?account=<slug>`).
- [ ] `InterviewRequest` has no `topicId` or `conversationId`; add columns so interviews link back to the enquiry.
- [ ] Webhook secret rotation in place (today: delete and recreate the endpoint).
- [ ] Calendar day boundaries use browser local time; timed items can shift for users far from the server timezone.
- [ ] Chart palette: the two extra hues (`#7C3AED`, `#0891B2`) used for coverage types are not Tailwind tokens yet.
- [ ] Contact page: "never emailed" filter in the filter drawer (the contact report links to the email-only view for now).
- [ ] Newsroom pages ignore newsletter `blocks` (body only).
- [ ] OpenAPI: the document is 3.0.3 with a top-level `webhooks` key from 3.1; switch to 3.1 when tooling allows.
