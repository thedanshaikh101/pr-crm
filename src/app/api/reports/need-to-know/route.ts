import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
// Step 5 replaces this with a .docx (docx npm package). Plain text for now so the button works end to end.
export async function GET() {
  const v = await getViewer();
  if (!v) return new Response("Unauthorized", { status: 401 });
  const since = new Date(Date.now() - 864e5);
  const [sends, opens, cov, conv] = await Promise.all([
    db.distributionRecipient.count({ where: { distribution: { accountId: v.account.id }, deliveredAt: { gte: since } } }),
    db.distributionRecipient.count({ where: { distribution: { accountId: v.account.id }, firstOpenAt: { gte: since } } }),
    db.coverage.findMany({ where: { accountId: v.account.id, createdAt: { gte: since } } }),
    db.conversation.findMany({ where: { accountId: v.account.id, createdAt: { gte: since } } }),
  ]);
  const lines = [`${v.account.name}: Need to Know, ${new Date().toLocaleString()}`, "", `Emails delivered: ${sends}`, `Emails opened: ${opens}`, "", `Coverage logged (${cov.length}):`, ...cov.map((c: any) => `- ${c.outletName}: ${c.headline}`), "", `New conversations (${conv.length}):`, ...conv.map((c: any) => `- ${c.question.slice(0, 120)}`)];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain", "content-disposition": `attachment; filename="need-to-know-${Date.now()}.txt"` } });
}
