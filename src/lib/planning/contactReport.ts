// Contact Report data. Server-side (DB); shared by the page and the CSV route.
import { db } from "@/lib/db";

export type Count = { label: string; count: number };

const top = (rows: Count[], n?: number) => { const s = rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)); return n ? s.slice(0, n) : s; };

export async function contactReportData(accountId: string) {
  const base = { accountId, deletedAt: null, mergedIntoId: null };
  const since30 = new Date(Date.now() - 30 * 864e5);
  const [contacts, subjects, byImportance, byEmailStatus, opens, replies, neverEmailed, total, updated] = await Promise.all([
    db.contact.findMany({ where: base, select: { classifications: true, audienceLocation: true } }),
    db.contactSubject.findMany({ where: { contact: base }, select: { subject: { select: { path: true } } } }),
    db.contact.groupBy({ by: ["importance"], where: base, _count: { _all: true } }),
    db.contact.groupBy({ by: ["emailStatus"], where: base, _count: { _all: true } }),
    db.distributionRecipient.groupBy({ by: ["contactId"], where: { distribution: { accountId, isTest: false }, contactId: { not: null }, openCount: { gt: 0 } }, _sum: { openCount: true }, orderBy: { _sum: { openCount: "desc" } }, take: 20 }),
    db.distributionRecipient.groupBy({ by: ["contactId"], where: { distribution: { accountId, isTest: false }, contactId: { not: null }, repliedAt: { not: null } }, _count: { _all: true }, orderBy: { _count: { contactId: "desc" } }, take: 20 }),
    db.contact.count({ where: { ...base, recipients: { none: {} } } }),
    db.contact.count({ where: base }),
    db.contact.findMany({ where: { ...base, significantUpdateAt: { gte: since30 } }, select: { id: true, firstName: true, lastName: true, significantUpdate: true, significantUpdateAt: true, organization: { select: { name: true } } }, orderBy: { significantUpdateAt: "desc" }, take: 100 }),
  ]);
  const tally = (get: (c: any) => string[]) => { const m = new Map<string, number>(); for (const c of contacts) for (const k of get(c)) m.set(k, (m.get(k) ?? 0) + 1); return Array.from(m, ([label, count]) => ({ label, count })); };
  const subjectCounts = new Map<string, number>();
  for (const s of subjects) { const k = s.subject.path.split(" > ")[0]; subjectCounts.set(k, (subjectCounts.get(k) ?? 0) + 1); }
  const ids = Array.from(new Set([...opens, ...replies].map((r: any) => r.contactId).filter(Boolean))) as string[];
  const people = ids.length ? await db.contact.findMany({ where: { id: { in: ids }, accountId }, select: { id: true, firstName: true, lastName: true, organization: { select: { name: true } } } }) : [];
  const person = (id: string) => { const p = people.find((x: any) => x.id === id); return p ? { id, name: `${p.firstName} ${p.lastName}`.trim(), outlet: p.organization?.name ?? null } : { id, name: "Deleted contact", outlet: null }; };
  return {
    total,
    byClassification: top(tally((c) => c.classifications.length ? c.classifications : ["Unclassified"])),
    bySubject: top(Array.from(subjectCounts, ([label, count]) => ({ label, count }))),
    byImportance: byImportance.map((r: any) => ({ label: r.importance, count: r._count._all })),
    byEmailStatus: byEmailStatus.map((r: any) => ({ label: r.emailStatus, count: r._count._all })),
    byAudience: top(tally((c) => c.audienceLocation), 15),
    topOpens: opens.map((r: any) => ({ ...person(r.contactId), value: r._sum.openCount ?? 0 })),
    topReplies: replies.map((r: any) => ({ ...person(r.contactId), value: r._count._all })),
    neverEmailed,
    updated: updated.map((c: any) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), outlet: c.organization?.name ?? null, note: c.significantUpdate, at: c.significantUpdateAt })),
  };
}

/** Per-contact engagement rows for the CSV export. */
export async function contactEngagementRows(accountId: string) {
  const recips = await db.distributionRecipient.findMany({ where: { distribution: { accountId, isTest: false }, contactId: { not: null } }, select: { contactId: true, deliveredAt: true, openCount: true, clickCount: true, repliedAt: true, bouncedAt: true, distribution: { select: { createdAt: true } } }, take: 200_000 });
  const agg = new Map<string, { sent: number; delivered: number; opens: number; clicks: number; replies: number; bounces: number; last: Date | null }>();
  for (const r of recips) {
    const id = r.contactId as string;
    const a = agg.get(id) ?? { sent: 0, delivered: 0, opens: 0, clicks: 0, replies: 0, bounces: 0, last: null };
    a.sent++; if (r.deliveredAt) a.delivered++; a.opens += r.openCount; a.clicks += r.clickCount; if (r.repliedAt) a.replies++; if (r.bouncedAt) a.bounces++;
    if (!a.last || r.distribution.createdAt > a.last) a.last = r.distribution.createdAt;
    agg.set(id, a);
  }
  const contacts = await db.contact.findMany({ where: { accountId, deletedAt: null, mergedIntoId: null }, select: { id: true, firstName: true, lastName: true, email: true, emailStatus: true, importance: true, organization: { select: { name: true } } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 50_000 });
  return contacts.map((c: any) => { const a = agg.get(c.id); return { id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), outlet: c.organization?.name ?? "", email: c.email ?? "", emailStatus: c.emailStatus, importance: c.importance, sent: a?.sent ?? 0, delivered: a?.delivered ?? 0, opens: a?.opens ?? 0, clicks: a?.clicks ?? 0, replies: a?.replies ?? 0, bounces: a?.bounces ?? 0, lastEmailedAt: a?.last ?? null }; });
}
