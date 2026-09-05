import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { paginate, pageResponse, readJson, withApiKey } from "@/lib/api/handler";
import { ListCreateBody } from "@/lib/api/schemas";
import { listOut } from "@/lib/api/serialize";

// GET /api/v1/lists
export const GET = withApiKey(async ({ url, account }) => {
  const { page, per, skip } = paginate(url);
  const where = { accountId: account.id, deletedAt: null };
  const [total, data] = await Promise.all([
    db.list.count({ where }),
    db.list.findMany({ where, skip, take: per, orderBy: { name: "asc" }, include: { _count: { select: { members: true } } } }),
  ]);
  return pageResponse(total, page, per, data.map(listOut));
});

// POST /api/v1/lists
export const POST = withApiKey(async ({ req, account }) => {
  const body = ListCreateBody.parse(await readJson(req));
  const l = await db.list.create({ data: { accountId: account.id, name: body.name, description: body.description ?? null }, include: { _count: { select: { members: true } } } });
  await audit(account.id, null, "list.create", "list", l.id, { via: "api" });
  return NextResponse.json(listOut(l), { status: 201 });
});
