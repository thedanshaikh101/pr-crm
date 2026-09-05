import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const v = await getViewer();
  if (!v) return new Response("Unauthorized", { status: 401 });
  const imp = await db.import.findFirst({ where: { id: params.id, accountId: v.account.id } });
  const csv = (imp?.rawRows as any)?.errorsCsv ?? "row,error";
  return new Response(csv, { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="import-errors-${params.id}.csv"` } });
}
