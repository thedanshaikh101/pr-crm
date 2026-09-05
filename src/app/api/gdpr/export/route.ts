import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { gdprSearch } from "@/lib/gdpr/search";
import { hashQuery } from "@/lib/gdpr/purge";

export const dynamic = "force-dynamic";

// GET /api/gdpr/export?q=   Downloads every matching row as JSON (subject access request). Admins only.
export async function GET(req: Request) {
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (v.role !== "OWNER" && v.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 3) return NextResponse.json({ error: "query too short" }, { status: 400 });
  const m = await gdprSearch(db, v.account.id, q);
  await audit(v.account.id, v.user.id, "gdpr.export", "account", v.account.id, { queryHash: hashQuery(q), total: m.total });
  const body = { exportedAt: new Date().toISOString(), account: v.account.slug, total: m.total, tables: Object.fromEntries(m.groups.map((g) => [g.table, g.rows])) };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="gdpr-export-${hashQuery(q)}.json"`, "cache-control": "no-store" },
  });
}
