// RSS ingestion for contacts' Recent Content. Every 6 hours, each contact with an rssUrl is fetched.
import type { Job } from "bullmq";
import { db } from "@/lib/db";
import { ingestContactFeed } from "@/lib/contacts/rssIngest";
import type { JobModule } from "./types";

const CONCURRENCY = 4;

async function rss(_job: Job) {
  const contacts = await db.contact.findMany({ where: { deletedAt: null, rssUrl: { not: null }, account: { suspendedAt: null } }, select: { id: true, rssUrl: true }, orderBy: { updatedAt: "asc" } });
  const totals = { contacts: contacts.length, ok: 0, failed: 0, added: 0 };
  let i = 0;
  const worker = async () => {
    while (i < contacts.length) {
      const c = contacts[i++];
      const r = await ingestContactFeed(db, c);
      if (r.ok) { totals.ok++; totals.added += r.added; } else { totals.failed++; console.warn(`[ingest/rss] ${c.id} ${c.rssUrl}: ${r.error}`); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, contacts.length) }, worker));
  console.log(`[ingest/rss] ${totals.ok} ok, ${totals.failed} failed, ${totals.added} new items`);
  return totals;
}

async function rssContact(job: Job<{ contactId: string; accountId?: string }>) {
  const c = await db.contact.findFirst({ where: { id: job.data.contactId, deletedAt: null, ...(job.data.accountId ? { accountId: job.data.accountId } : {}) }, select: { id: true, rssUrl: true } });
  if (!c) return { ok: false, error: "not found" };
  return ingestContactFeed(db, c);
}

export const ingestRssModule: JobModule = {
  queue: "ingest",
  processors: { rss, "rss-contact": rssContact },
  schedules: [{ name: "rss", pattern: "0 */6 * * *" }],
};
