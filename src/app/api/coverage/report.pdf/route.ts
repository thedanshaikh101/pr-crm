import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayBound } from "@/lib/coverage/filters";
import { buildCoveragePdf, type CoverageReportData } from "@/lib/reports/coveragePdf";

export const dynamic = "force-dynamic";

/** Client logo, only when it is an http(s) PNG or JPG that fetches within 5 s. Anything else is skipped silently. */
async function fetchLogo(url: string | null): Promise<CoverageReportData["logo"]> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 PressdeskBot" } });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 5 * 1024 * 1024) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if (isPng || ct.includes("png")) return { bytes, type: "png" };
    if (isJpg || ct.includes("jpeg") || ct.includes("jpg")) return { bytes, type: "jpg" };
    return null;
  } catch { return null; } finally { clearTimeout(t); }
}

export async function GET(req: Request) {
  const v = await getViewer();
  if (!v) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const clientId = sp.get("clientId") || null;
  const releaseId = sp.get("releaseId") || null;
  const from = sp.get("from") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("from")!) ? sp.get("from")! : null;
  const to = sp.get("to") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("to")!) ? sp.get("to")! : null;

  const client = clientId ? await db.client.findFirst({ where: { id: clientId, accountId: v.account.id } }) : null;
  const where: any = { AND: [{ accountId: v.account.id, deletedAt: null }, { parentId: null }] };
  if (client) where.AND.push({ clientId: client.id });
  if (releaseId) where.AND.push({ releaseId });
  if (from) where.AND.push({ publishedAt: { gte: dayBound(from) } });
  if (to) where.AND.push({ publishedAt: { lte: dayBound(to, true) } });
  const [rows, logo] = await Promise.all([
    db.coverage.findMany({ where, orderBy: { publishedAt: "desc" }, take: 2000 }),
    fetchLogo(client?.logoUrl ?? null),
  ]);
  const bytes = await buildCoveragePdf({
    title: client?.name ?? v.account.name, accountName: v.account.name, logo, from, to, generatedAt: new Date(),
    items: rows.map((c: any) => ({ date: c.publishedAt, outlet: c.outletName, headline: c.headline, url: c.url, type: c.type, focus: c.focus, sentiment: c.sentiment, reach: c.estimatedReach, ave: c.adValue == null ? null : Number(c.adValue), pickups: c.pickupCount })),
  });
  const slug = (client?.name ?? v.account.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "report";
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="coverage-${slug}-${new Date().toISOString().slice(0, 10)}.pdf"` } });
}
