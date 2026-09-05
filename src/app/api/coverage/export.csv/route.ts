import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildCoverageWhere, orderFor, parseFilters } from "@/lib/coverage/filters";
import { COVERAGE_CSV_HEAD, coverageCsvRow, csvLine } from "@/lib/coverage/csv";

export const dynamic = "force-dynamic";

/** Streams the coverage list as CSV. Same filters as the list, or ?ids= for a selection. */
export async function GET(req: Request) {
  const v = await getViewer();
  if (!v) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids")?.split(",").filter(Boolean);
  const f = parseFilters(Object.fromEntries(url.searchParams));
  const where = ids?.length ? { id: { in: ids }, accountId: v.account.id, deletedAt: null } : buildCoverageWhere(f, v.account.id);
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(csvLine(COVERAGE_CSV_HEAD) + "\n"));
      let cursor: string | undefined;
      for (let guard = 0; guard < 200; guard++) {
        const rows = await db.coverage.findMany({
          where, orderBy: [...orderFor(f.sort), { id: "asc" }], take: 500, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          include: { client: { select: { name: true } }, release: { select: { headline: true } }, tags: { include: { tag: { select: { name: true } } } } },
        });
        if (!rows.length) break;
        controller.enqueue(enc.encode(rows.map((r: any) => coverageCsvRow(r)).join("\n") + "\n"));
        cursor = rows[rows.length - 1].id;
        if (rows.length < 500) break;
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="coverage-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
