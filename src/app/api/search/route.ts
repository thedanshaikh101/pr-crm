import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const v = await getViewer();
  if (!v) return NextResponse.json([], { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json([]);
  const a = v.account.id;
  const ci = { contains: q, mode: "insensitive" as const };
  const [contacts, orgs, lists, releases, coverage] = await Promise.all([
    db.contact.findMany({ where: { accountId: a, deletedAt: null, OR: [{ firstName: ci }, { lastName: ci }, { email: ci }, { searchText: ci }] }, include: { organization: true }, take: 6 }),
    db.organization.findMany({ where: { accountId: a, deletedAt: null, name: ci }, take: 4 }),
    db.list.findMany({ where: { accountId: a, deletedAt: null, name: ci }, take: 4 }),
    db.release.findMany({ where: { accountId: a, deletedAt: null, headline: ci }, take: 4 }),
    db.coverage.findMany({ where: { accountId: a, deletedAt: null, OR: [{ headline: ci }, { outletName: ci }] }, take: 4 }),
  ]);
  return NextResponse.json([
    ...contacts.map((c: any) => ({ kind: "Contact", id: c.id, title: `${c.firstName} ${c.lastName}`, sub: c.organization?.name, href: `/contacts/${c.id}` })),
    ...orgs.map((o: any) => ({ kind: "Organization", id: o.id, title: o.name, href: `/organizations/${o.id}` })),
    ...lists.map((l: any) => ({ kind: "List", id: l.id, title: l.name, href: `/lists/${l.id}` })),
    ...releases.map((r: any) => ({ kind: "Release", id: r.id, title: r.headline, sub: r.status, href: `/releases/${r.id}` })),
    ...coverage.map((c: any) => ({ kind: "Coverage", id: c.id, title: c.headline, sub: c.outletName, href: `/coverage/${c.id}` })),
  ]);
}
