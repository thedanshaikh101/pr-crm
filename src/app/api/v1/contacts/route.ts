import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertContactCapacity } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dateParam, paginate, pageResponse, readJson, withApiKey } from "@/lib/api/handler";
import { ContactCreateBody } from "@/lib/api/schemas";
import { contactOut } from "@/lib/api/serialize";
import { ensureOrg, setTags } from "@/lib/api/contactsShared";

export const CONTACT_INCLUDE = { organization: { select: { name: true } }, tags: { include: { tag: { select: { name: true } } } } } as const;

// GET /api/v1/contacts?q=&list=&tag=&updatedSince=&page=&per=
export const GET = withApiKey(async ({ url, account }) => {
  const { page, per, skip } = paginate(url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const list = url.searchParams.get("list");
  const tag = url.searchParams.get("tag");
  const updatedSince = dateParam(url, "updatedSince");
  const and: any[] = [{ accountId: account.id, deletedAt: null, mergedIntoId: null }];
  if (q) and.push({ OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { jobTitle: { contains: q, mode: "insensitive" } }, { organization: { name: { contains: q, mode: "insensitive" } } }, { searchText: { contains: q, mode: "insensitive" } }] });
  if (list) and.push({ listMembers: { some: { listId: list, list: { accountId: account.id } } } });
  if (tag) and.push({ tags: { some: { tag: { accountId: account.id, OR: [{ id: tag }, { name: { equals: tag, mode: "insensitive" } }] } } } });
  if (updatedSince) and.push({ updatedAt: { gte: updatedSince } });
  const where = { AND: and };
  const [total, data] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({ where, skip, take: per, orderBy: { updatedAt: "desc" }, include: CONTACT_INCLUDE }),
  ]);
  return pageResponse(total, page, per, data.map(contactOut));
});

// POST /api/v1/contacts
export const POST = withApiKey(async ({ req, account }) => {
  const body = ContactCreateBody.parse(await readJson(req));
  await assertContactCapacity(account.id, account.plan);
  const organizationId = await ensureOrg(account.id, body.outlet ?? null);
  const c = await db.contact.create({
    data: {
      accountId: account.id, organizationId, firstName: body.firstName, lastName: body.lastName, email: body.email ?? null, jobTitle: body.jobTitle ?? null,
      mobile: body.mobile ?? null, landline: body.landline ?? null, searchText: [body.firstName, body.lastName, body.email, body.jobTitle, body.outlet].filter(Boolean).join(" "),
    },
  });
  if (body.tags?.length) await setTags(account.id, c.id, body.tags);
  await audit(account.id, null, "contact.create", "contact", c.id, { via: "api" });
  const full = await db.contact.findFirst({ where: { id: c.id, accountId: account.id }, include: CONTACT_INCLUDE });
  return NextResponse.json(contactOut(full), { status: 201 });
});
