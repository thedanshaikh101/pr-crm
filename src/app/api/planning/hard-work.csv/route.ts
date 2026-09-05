import { getViewer } from "@/lib/auth";
import { rangeFor } from "@/lib/planning/agg";
import { HARD_WORK_METRICS, hardWorkRows, hardWorkTotals } from "@/lib/planning/hardWork";
import { toCsv } from "@/lib/coverage/csv";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const v = await getViewer();
  if (!v) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const range = rangeFor(sp.get("preset") ?? undefined, sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  const rows = await hardWorkRows(v.account.id, range.from, range.to, sp.get("client") || null);
  const totals = hardWorkTotals(rows);
  const csv = toCsv(["Teammate", "Email", "Role", ...HARD_WORK_METRICS.map(([, l]) => l)], [
    ...rows.map((r) => [r.name, r.email, r.role, ...HARD_WORK_METRICS.map(([k]) => r[k])]),
    ["Total", "", "", ...HARD_WORK_METRICS.map(([k]) => totals[k])],
  ]);
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="hard-work-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
