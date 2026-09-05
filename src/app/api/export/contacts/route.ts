import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildContactWhere, parseFilters } from "@/lib/contacts/filters";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const v = await getViewer();
  if (!v) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids")?.split(",").filter(Boolean);
  const listId = url.searchParams.get("list");
  const where = ids?.length
    ? { id: { in: ids }, accountId: v.account.id }
    : listId ? { accountId: v.account.id, deletedAt: null, listMembers: { some: { listId } } }
    : buildContactWhere(parseFilters(Object.fromEntries(url.searchParams)), v.account.id, v.user.id);
  const rows = await db.contact.findMany({ where, include: { organization: true, subjects: { include: { subject: true } } }, take: 50_000 });
  const head = ["First name", "Last name", "Email", "Outlet", "Job title", "Landline", "Mobile", "X handle", "X followers", "Subjects", "Classification", "Audience location", "Physical location", "Language", "Importance"];
  const body = rows.map((c: any) => [c.firstName, c.lastName, c.email, c.organization?.name, c.jobTitle, c.landline, c.mobile, c.xHandle, c.xFollowers, c.subjects.map((s: any) => s.subject.path).join("; "), c.classifications.join("; "), c.audienceLocation.join("; "), c.physicalLocation, c.language, c.importance].map(esc).join(","));
  return new Response([head.map(esc).join(","), ...body].join("\n"), { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="contacts-${Date.now()}.csv"` } });
}
