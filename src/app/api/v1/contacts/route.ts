import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountFromApiKey } from "@/lib/api/auth";
import { assertContactCapacity } from "@/lib/auth";

// GET /api/v1/contacts?q=&page=&per=   POST /api/v1/contacts   (Bearer <api key>)
export async function GET(req: Request) {
  const account = await accountFromApiKey(req);
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = new URL(req.url);
  const q = u.searchParams.get("q") ?? "";
  const page = Math.max(1, Number(u.searchParams.get("page") ?? 1));
  const per = Math.min(250, Number(u.searchParams.get("per") ?? 100));
  const where = { accountId: account.id, deletedAt: null, ...(q ? { searchText: { contains: q, mode: "insensitive" as const } } : {}) };
  const [total, data] = await Promise.all([db.contact.count({ where }), db.contact.findMany({ where, skip: (page - 1) * per, take: per, include: { organization: { select: { name: true } } } })]);
  return NextResponse.json({ total, page, per, data: data.map((c: any) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email, jobTitle: c.jobTitle, outlet: c.organization?.name ?? null, updatedAt: c.updatedAt })) });
}

const Body = z.object({ firstName: z.string().min(1), lastName: z.string().default(""), email: z.string().email().optional(), jobTitle: z.string().optional(), outlet: z.string().optional() });

export async function POST(req: Request) {
  const account = await accountFromApiKey(req);
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  try { await assertContactCapacity(account.id, account.plan); } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 402 }); }
  const org = p.data.outlet ? await db.organization.upsert({ where: { accountId_name: { accountId: account.id, name: p.data.outlet } }, create: { accountId: account.id, name: p.data.outlet }, update: {} }) : null;
  const c = await db.contact.create({ data: { accountId: account.id, organizationId: org?.id, firstName: p.data.firstName, lastName: p.data.lastName, email: p.data.email, jobTitle: p.data.jobTitle, searchText: `${p.data.firstName} ${p.data.lastName} ${p.data.email ?? ""} ${p.data.outlet ?? ""}` } });
  return NextResponse.json({ id: c.id }, { status: 201 });
}
