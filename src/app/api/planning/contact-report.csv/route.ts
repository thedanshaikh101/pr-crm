import { getViewer } from "@/lib/auth";
import { contactEngagementRows } from "@/lib/planning/contactReport";
import { toCsv } from "@/lib/coverage/csv";

export const dynamic = "force-dynamic";

export async function GET() {
  const v = await getViewer();
  if (!v) return new Response("Unauthorized", { status: 401 });
  const rows = await contactEngagementRows(v.account.id);
  const csv = toCsv(["Name", "Outlet", "Email", "Email status", "Importance", "Sent", "Delivered", "Opens", "Clicks", "Replies", "Bounces", "Last emailed"],
    rows.map((r) => [r.name, r.outlet, r.email, r.emailStatus, r.importance, r.sent, r.delivered, r.opens, r.clicks, r.replies, r.bounces, r.lastEmailedAt ? r.lastEmailedAt.toISOString().slice(0, 10) : ""]));
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="contact-report-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
