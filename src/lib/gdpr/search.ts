// Find a person across every table that can hold personal data. Shared by the settings
// screen, the JSON export route and the purge action so all three see the same rows.
import type { PrismaClient } from "@prisma/client";

export type GdprGroup = { table: string; count: number; samples: Record<string, unknown>[]; rows: Record<string, unknown>[] };
export type GdprMatches = { q: string; total: number; groups: GdprGroup[] };

const SAMPLE = 5;
const CAP = 5000;

function group(table: string, rows: Record<string, unknown>[]): GdprGroup {
  return { table, count: rows.length, samples: rows.slice(0, SAMPLE), rows };
}

const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

export function looksLikeEmail(q: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim());
}

/** Search every table for `q` (an email address or a name fragment). Empty query returns nothing. */
export async function gdprSearch(db: PrismaClient, accountId: string, rawQ: string): Promise<GdprMatches> {
  const q = rawQ.trim();
  if (q.length < 3) return { q, total: 0, groups: [] };
  const isEmail = looksLikeEmail(q);
  const like = `%${q}%`;

  const contacts = await db.contact.findMany({
    where: { accountId, OR: [{ email: ci(q) }, { firstName: ci(q) }, { lastName: ci(q) }] },
    select: { id: true, firstName: true, lastName: true, email: true, jobTitle: true, deletedAt: true, createdAt: true }, take: CAP,
  });
  const contactIds = contacts.map((c: any) => c.id as string);

  const recipients = await db.distributionRecipient.findMany({
    where: { distribution: { accountId }, OR: [{ email: ci(q) }, { name: ci(q) }, ...(contactIds.length ? [{ contactId: { in: contactIds } }] : [])] },
    select: { id: true, email: true, name: true, outlet: true, contactId: true, distributionId: true, deliveredAt: true }, take: CAP,
  });
  const suppressions = await db.suppression.findMany({ where: { accountId, email: ci(q) }, select: { id: true, email: true, reason: true, createdAt: true }, take: CAP });
  const conversations = await db.conversation.findMany({
    where: { accountId, OR: [{ contact: { email: ci(q) } }, { outletName: ci(q) }, { question: ci(q) }, ...(contactIds.length ? [{ contactId: { in: contactIds } }] : [])] },
    select: { id: true, contactId: true, outletName: true, question: true, receivedAt: true, status: true }, take: CAP,
  });
  const interviews = await db.interviewRequest.findMany({
    where: { accountId, OR: [{ contact: { email: ci(q) } }, { spokesperson: ci(q) }, ...(contactIds.length ? [{ contactId: { in: contactIds } }] : [])] },
    select: { id: true, contactId: true, outletName: true, spokesperson: true, status: true, createdAt: true }, take: CAP,
  });
  const notes = await db.note.findMany({ where: { accountId, body: ci(q) }, select: { id: true, contactId: true, body: true, createdAt: true }, take: CAP });
  const coverage = await db.coverage.findMany({
    where: { accountId, OR: [{ contact: { email: ci(q) } }, ...(isEmail ? [] : [{ headline: ci(q) }]), ...(contactIds.length ? [{ contactId: { in: contactIds } }] : [])] },
    select: { id: true, contactId: true, outletName: true, headline: true, publishedAt: true }, take: CAP,
  });
  const audits = (await db.$queryRaw`SELECT id, action, entity, "entityId", meta, "createdAt" FROM "AuditLog" WHERE "accountId" = ${accountId} AND meta IS NOT NULL AND meta::text ILIKE ${like} LIMIT ${CAP}`) as Record<string, unknown>[];
  const invitations = await db.invitation.findMany({ where: { accountId, email: ci(q) }, select: { id: true, email: true, role: true, acceptedAt: true, expiresAt: true }, take: CAP });

  const groups = [
    group("Contact", contacts.map((r: any) => ({ ...r, name: `${r.firstName} ${r.lastName}`.trim() }))),
    group("DistributionRecipient", recipients as any),
    group("Suppression", suppressions as any),
    group("Conversation", conversations.map((r: any) => ({ ...r, question: String(r.question).slice(0, 160) }))),
    group("InterviewRequest", interviews as any),
    group("Note", notes.map((r: any) => ({ ...r, body: String(r.body).slice(0, 160) }))),
    group("Coverage", coverage as any),
    group("AuditLog", audits),
    group("Invitation", invitations as any),
  ];
  return { q, total: groups.reduce((n, g) => n + g.count, 0), groups };
}

/** One-line label for a sample row, per table. */
export function sampleLabel(table: string, r: Record<string, unknown>) {
  switch (table) {
    case "Contact": return `${r.name ?? ""} ${r.email ? `<${r.email}>` : ""}`.trim();
    case "DistributionRecipient": return `${r.name ?? ""} <${r.email}>`.trim();
    case "Suppression": return `${r.email} (${r.reason})`;
    case "Conversation": return `${r.outletName ?? "No outlet"}: ${r.question}`;
    case "InterviewRequest": return `${r.spokesperson} (${r.outletName ?? "no outlet"}, ${r.status})`;
    case "Note": return String(r.body);
    case "Coverage": return `${r.outletName}: ${r.headline}`;
    case "AuditLog": return `${r.action} ${r.entity ?? ""} ${r.entityId ?? ""}`.trim();
    case "Invitation": return `${r.email} (${r.role})`;
    default: return String(r.id);
  }
}
