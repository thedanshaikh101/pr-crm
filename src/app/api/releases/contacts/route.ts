import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";

/** Typeahead for the distribution recipient picker. Session-authenticated. */
export async function GET(req: Request) {
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);
  const ci = { contains: q, mode: "insensitive" as const };
  const rows = await db.contact.findMany({
    where: { accountId: v.account.id, deletedAt: null, mergedIntoId: null, OR: [{ visibility: "SHARED" }, { ownerId: v.user.id }], AND: [{ OR: [{ firstName: ci }, { lastName: ci }, { email: ci }, { searchText: ci }, { organization: { name: ci } }] }] },
    include: { organization: { select: { name: true } } }, orderBy: [{ lastName: "asc" }], take: 12,
  });
  return NextResponse.json(rows.map((c: any) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), outlet: c.organization?.name ?? null, email: c.email, emailStatus: c.emailStatus })));
}
