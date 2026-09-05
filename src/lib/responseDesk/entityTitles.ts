// Resolve human titles for (entity, entityId) references on activities and attachments. Server only (uses db).
import { db } from "@/lib/db";
import { truncate } from "./labels";

export type EntityRef = { entity: string | null; entityId: string | null };

export async function resolveEntityTitles(accountId: string, refs: EntityRef[]) {
  const ids = (entity: string) => Array.from(new Set(refs.filter((r) => r.entity === entity && r.entityId).map((r) => r.entityId as string)));
  const titles = new Map<string, string>();
  const key = (e: string, id: string) => `${e}:${id}`;
  const [contacts, conversations, topics, statements, interviews, releases] = await Promise.all([
    ids("contact").length ? db.contact.findMany({ where: { accountId, id: { in: ids("contact") } }, select: { id: true, firstName: true, lastName: true } }) : [],
    ids("conversation").length ? db.conversation.findMany({ where: { accountId, id: { in: ids("conversation") } }, select: { id: true, question: true, outletName: true } }) : [],
    ids("topic").length ? db.topic.findMany({ where: { accountId, id: { in: ids("topic") } }, select: { id: true, name: true } }) : [],
    ids("statement").length ? db.statement.findMany({ where: { accountId, id: { in: ids("statement") } }, select: { id: true, title: true } }) : [],
    ids("interview").length ? db.interviewRequest.findMany({ where: { accountId, id: { in: ids("interview") } }, select: { id: true, spokesperson: true, outletName: true } }) : [],
    ids("release").length ? db.release.findMany({ where: { accountId, id: { in: ids("release") } }, select: { id: true, headline: true } }) : [],
  ]);
  for (const c of contacts as any[]) titles.set(key("contact", c.id), `${c.firstName} ${c.lastName}`.trim());
  for (const c of conversations as any[]) titles.set(key("conversation", c.id), `${c.outletName ? c.outletName + ": " : ""}${truncate(c.question, 60)}`);
  for (const t of topics as any[]) titles.set(key("topic", t.id), t.name);
  for (const s of statements as any[]) titles.set(key("statement", s.id), s.title);
  for (const i of interviews as any[]) titles.set(key("interview", i.id), `${i.spokesperson}${i.outletName ? " with " + i.outletName : ""}`);
  for (const r of releases as any[]) titles.set(key("release", r.id), r.headline);
  return (entity: string | null | undefined, entityId: string | null | undefined) => (entity && entityId ? titles.get(key(entity, entityId)) ?? null : null);
}
