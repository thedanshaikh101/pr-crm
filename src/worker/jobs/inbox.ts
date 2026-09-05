// Shared inbox IMAP poller. Runs every 5 minutes; a no-op until INBOX_IMAP_* and INBOX_ACCOUNT_SLUG are set.
// Env: INBOX_IMAP_HOST, INBOX_IMAP_PORT (default 993, TLS), INBOX_IMAP_USER, INBOX_IMAP_PASS, INBOX_ACCOUNT_SLUG.
import type { Job } from "bullmq";
import { db } from "@/lib/db";
import { normalizeInboundEmail } from "@/lib/responseDesk/inbox";
import { applyInboundEmail } from "@/lib/responseDesk/inboxApply";
import type { JobModule } from "./types";

function imapConfig() {
  const host = process.env.INBOX_IMAP_HOST, user = process.env.INBOX_IMAP_USER, pass = process.env.INBOX_IMAP_PASS, slug = process.env.INBOX_ACCOUNT_SLUG;
  if (!host || !user || !pass || !slug) return null;
  return { host, port: Number(process.env.INBOX_IMAP_PORT ?? 993), user, pass, slug };
}

async function pollInbox(_job: Job) {
  const cfg = imapConfig();
  if (!cfg) { console.log("poll-inbox skipped: IMAP not configured"); return { skipped: true }; }
  const account = await db.account.findUnique({ where: { slug: cfg.slug }, select: { id: true } });
  if (!account) { console.warn(`poll-inbox skipped: no account with slug ${cfg.slug}`); return { skipped: true }; }

  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");
  const client = new ImapFlow({ host: cfg.host, port: cfg.port, secure: cfg.port === 993, auth: { user: cfg.user, pass: cfg.pass }, logger: false });
  let created = 0, seen = 0;
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const handled: number[] = [];
      for await (const msg of client.fetch({ seen: false }, { uid: true, envelope: true, source: true })) {
        seen++;
        try {
          const parsed = msg.source ? await simpleParser(msg.source) : null;
          const env = msg.envelope;
          const norm = normalizeInboundEmail({
            from: parsed?.from?.value?.[0] ?? env?.from?.[0] ?? null,
            subject: parsed?.subject ?? env?.subject ?? "",
            text: parsed?.text ?? "",
            html: typeof parsed?.html === "string" ? parsed.html : "",
            messageId: parsed?.messageId ?? env?.messageId ?? null,
            receivedAt: parsed?.date ?? env?.date ?? new Date(),
          });
          const r = await applyInboundEmail(db, account.id, norm);
          if (r.created) created++;
          handled.push(msg.uid);
        } catch (e) {
          console.error(`poll-inbox: could not process uid ${msg.uid}:`, (e as Error).message);
        }
      }
      if (handled.length) await client.messageFlagsAdd(handled, ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  console.log(`poll-inbox: ${seen} unseen, ${created} conversations created`);
  return { seen, created };
}

const inboxJobs: JobModule = {
  queue: "ingest",
  processors: { "poll-inbox": pollInbox },
  schedules: [{ name: "poll-inbox", pattern: "*/5 * * * *" }],
};
export default inboxJobs;
