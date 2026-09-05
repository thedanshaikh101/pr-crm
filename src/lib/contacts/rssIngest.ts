// Shared by the ingest worker and the refreshContent server action: fetch one contact's feed,
// upsert ContentItem rows by (contactId, url), keep the newest 20.
import type { PrismaClient } from "@prisma/client";
import { parseFeed } from "./rss";

export const KEEP_PER_CONTACT = 20;
export const FETCH_TIMEOUT_MS = 8000;
const UA = "Mozilla/5.0 (compatible; PressdeskBot/1.0; +https://pressdesk.example)";

export type IngestResult = { ok: boolean; added: number; seen: number; error?: string };

export async function fetchFeedText(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" }, signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
  if (!res.ok) throw new Error(`Feed returned HTTP ${res.status}`);
  return res.text();
}

export async function ingestContactFeed(db: PrismaClient, contact: { id: string; rssUrl: string | null }, opts: { fetchText?: (url: string) => Promise<string> } = {}): Promise<IngestResult> {
  if (!contact.rssUrl) return { ok: false, added: 0, seen: 0, error: "No feed URL" };
  let xml: string;
  try { xml = await (opts.fetchText ?? fetchFeedText)(contact.rssUrl); }
  catch (e: any) { return { ok: false, added: 0, seen: 0, error: e?.name === "TimeoutError" ? "Feed timed out" : e?.message ?? "Fetch failed" }; }
  const feed = parseFeed(xml);
  const items = feed.items.filter((i) => /^https?:\/\//i.test(i.link)).slice(0, 50);
  let added = 0;
  for (const it of items) {
    const existing = await db.contentItem.findFirst({ where: { contactId: contact.id, url: it.link }, select: { id: true, publishedAt: true, title: true } });
    if (existing) {
      if ((it.publishedAt && !existing.publishedAt) || (it.title && it.title !== existing.title)) {
        await db.contentItem.update({ where: { id: existing.id }, data: { title: it.title || existing.title, publishedAt: it.publishedAt ?? existing.publishedAt } });
      }
      continue;
    }
    await db.contentItem.create({ data: { contactId: contact.id, title: it.title.slice(0, 500), url: it.link.slice(0, 2000), publishedAt: it.publishedAt, source: "rss" } });
    added++;
  }
  // Trim to the newest N per contact (null dates sort last so they go first).
  const old = await db.contentItem.findMany({ where: { contactId: contact.id }, orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }], skip: KEEP_PER_CONTACT, select: { id: true } });
  if (old.length) await db.contentItem.deleteMany({ where: { id: { in: old.map((o: any) => o.id) } } });
  return { ok: true, added, seen: items.length };
}
