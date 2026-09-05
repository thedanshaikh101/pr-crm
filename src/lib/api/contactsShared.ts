// Small DB helpers shared by the contact API routes.
import { db } from "@/lib/db";

export async function ensureOrg(accountId: string, name: string | null) {
  if (!name) return null;
  const org = await db.organization.upsert({ where: { accountId_name: { accountId, name } }, create: { accountId, name }, update: {} });
  return org.id as string;
}

/** Replace a contact's tag set with the given names (creating tags as needed). */
export async function setTags(accountId: string, contactId: string, names: string[]) {
  const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  const ids: string[] = [];
  for (const name of unique) {
    const t = await db.tag.upsert({ where: { accountId_name: { accountId, name } }, create: { accountId, name }, update: {} });
    ids.push(t.id);
  }
  await db.contactTag.deleteMany({ where: { contactId, tagId: { notIn: ids } } });
  if (ids.length) await db.contactTag.createMany({ data: ids.map((tagId) => ({ contactId, tagId })), skipDuplicates: true });
}

export function searchTextOf(c: { firstName: string; lastName: string; email?: string | null; jobTitle?: string | null; xBio?: string | null; bio?: string | null }, outlet?: string | null) {
  return [c.firstName, c.lastName, c.email, c.jobTitle, outlet, c.xBio, c.bio].filter(Boolean).join(" ");
}
