import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiHttpError, paginate, pageResponse, readJson, withApiKey } from "@/lib/api/handler";
import { MembersBody } from "@/lib/api/schemas";
import { contactOut } from "@/lib/api/serialize";
import { buildContactWhere, parseFilters } from "@/lib/contacts/filters";

const INCLUDE = { organization: { select: { name: true } }, tags: { include: { tag: { select: { name: true } } } } } as const;

async function loadList(accountId: string, id: string) {
  const l = await db.list.findFirst({ where: { id, accountId, deletedAt: null } });
  if (!l) throw new ApiHttpError(404, "list not found");
  return l;
}

// GET /api/v1/lists/{id}/members
export const GET = withApiKey(async ({ url, account, params }) => {
  const l = await loadList(account.id, params.id);
  const { page, per, skip } = paginate(url);
  const where = l.isSmart
    ? buildContactWhere(parseFilters(Object.fromEntries(new URLSearchParams((l.smartFilter as any)?.query ?? ""))), account.id, "")
    : { accountId: account.id, deletedAt: null, listMembers: { some: { listId: l.id } } };
  const [total, data] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({ where, skip, take: per, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], include: INCLUDE }),
  ]);
  return pageResponse(total, page, per, data.map(contactOut));
});

// POST /api/v1/lists/{id}/members  {contactIds: []}
export const POST = withApiKey(async ({ req, account, params }) => {
  const l = await loadList(account.id, params.id);
  if (l.isSmart) throw new ApiHttpError(400, "Smart groups compute their members from a filter; add contacts to a static list instead");
  const body = MembersBody.parse(await readJson(req));
  const owned = await db.contact.findMany({ where: { id: { in: body.contactIds }, accountId: account.id, deletedAt: null }, select: { id: true } });
  const r = await db.listMember.createMany({ data: owned.map((c: any) => ({ listId: l.id, contactId: c.id })), skipDuplicates: true });
  await db.list.update({ where: { id: l.id }, data: { updatedAt: new Date() } });
  await audit(account.id, null, "list.add_members", "list", l.id, { via: "api", count: r.count });
  const memberCount = await db.listMember.count({ where: { listId: l.id } });
  return NextResponse.json({ ok: true, count: r.count, memberCount });
});

// DELETE /api/v1/lists/{id}/members  {contactIds: []}
export const DELETE = withApiKey(async ({ req, account, params }) => {
  const l = await loadList(account.id, params.id);
  if (l.isSmart) throw new ApiHttpError(400, "Smart groups compute their members from a filter");
  const body = MembersBody.parse(await readJson(req));
  const r = await db.listMember.deleteMany({ where: { listId: l.id, contactId: { in: body.contactIds } } });
  await audit(account.id, null, "list.remove_members", "list", l.id, { via: "api", count: r.count });
  const memberCount = await db.listMember.count({ where: { listId: l.id } });
  return NextResponse.json({ ok: true, count: r.count, memberCount });
});
