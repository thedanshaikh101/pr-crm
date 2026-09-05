// Server-side recipient gathering for a distribution (lists, contacts, ad hoc). Pure dedupe lives in ./recipients.
import { db } from "@/lib/db";
import { buildContactWhere, parseFilters } from "@/lib/contacts/filters";
import { parseAdHoc, resolveRecipients, type Candidate } from "./recipients";

export type RecipientInput = { listIds: string[]; contactIds: string[]; adhoc: string };

const CONTACT_SELECT = { id: true, firstName: true, lastName: true, email: true, emailStatus: true, organization: { select: { name: true } } } as const;

function toCandidate(c: any, source: Candidate["source"]): Candidate {
  return { contactId: c.id, name: `${c.firstName} ${c.lastName}`.trim(), outlet: c.organization?.name ?? null, email: c.email, emailStatus: c.emailStatus, source };
}

export async function gatherCandidates(accountId: string, userId: string, input: RecipientInput) {
  const out: Candidate[] = [];
  const lists = input.listIds.length ? await db.list.findMany({ where: { accountId, deletedAt: null, id: { in: input.listIds } } }) : [];
  for (const l of lists as any[]) {
    const where = l.isSmart
      ? buildContactWhere(parseFilters(Object.fromEntries(new URLSearchParams((l.smartFilter as any)?.query ?? ""))), accountId, userId)
      : { accountId, deletedAt: null, listMembers: { some: { listId: l.id } } };
    const rows = await db.contact.findMany({ where, select: CONTACT_SELECT, take: 20000 });
    for (const c of rows) out.push(toCandidate(c, "list"));
  }
  if (input.contactIds.length) {
    const rows = await db.contact.findMany({ where: { accountId, deletedAt: null, id: { in: input.contactIds } }, select: CONTACT_SELECT });
    for (const c of rows) out.push(toCandidate(c, "contact"));
  }
  for (const a of parseAdHoc(input.adhoc)) out.push({ name: a.name, email: a.email, source: "adhoc" });
  return out;
}

export async function suppressedEmails(accountId: string, emails: string[]) {
  if (!emails.length) return [] as string[];
  const rows = await db.suppression.findMany({ where: { accountId, email: { in: emails } }, select: { email: true } });
  return rows.map((r: any) => String(r.email).toLowerCase());
}

export async function resolveForAccount(accountId: string, userId: string, input: RecipientInput) {
  const candidates = await gatherCandidates(accountId, userId, input);
  const emails = Array.from(new Set(candidates.map((c) => (c.email ?? "").toLowerCase()).filter(Boolean)));
  const sup = await suppressedEmails(accountId, emails);
  return resolveRecipients(candidates, sup);
}
