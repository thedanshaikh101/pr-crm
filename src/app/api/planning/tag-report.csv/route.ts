import { getViewer } from "@/lib/auth";
import { sortTagRows, TAG_SORTS, tagReportRows, type TagSort } from "@/lib/planning/tagReport";
import { toCsv } from "@/lib/coverage/csv";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const v = await getViewer();
  if (!v) return new Response("Unauthorized", { status: 401 });
  const s = new URL(req.url).searchParams.get("sort") ?? "contacts";
  const rows = sortTagRows(await tagReportRows(v.account.id), (TAG_SORTS.includes(s as TagSort) ? s : "contacts") as TagSort);
  const csv = toCsv(["Group", "Tag", "Colour", "Contacts", "Releases", "Coverage", "Last used"], rows.map((r) => [r.group, r.name, r.color, r.contacts, r.releases, r.coverage, r.lastUsed ? r.lastUsed.toISOString().slice(0, 10) : ""]));
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="tag-report-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
