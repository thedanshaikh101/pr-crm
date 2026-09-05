import { Packer } from "docx";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildNeedToKnowDoc } from "@/lib/reports/needToKnow";

export const dynamic = "force-dynamic";

/** Need to Know: the last 24 hours as a Word document. */
export async function GET() {
  const v = await getViewer();
  if (!v) return new Response("Unauthorized", { status: 401 });
  const a = v.account.id;
  const now = new Date();
  const since = new Date(now.getTime() - 864e5);
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
  const weekOut = new Date(now.getTime() + 7 * 864e5);
  const [delivered, opened, replied, bounced, coverage, conversations, releases, tasks, activity, members] = await Promise.all([
    db.distributionRecipient.count({ where: { distribution: { accountId: a }, deliveredAt: { gte: since } } }),
    db.distributionRecipient.count({ where: { distribution: { accountId: a }, firstOpenAt: { gte: since } } }),
    db.distributionRecipient.count({ where: { distribution: { accountId: a }, repliedAt: { gte: since } } }),
    db.distributionRecipient.count({ where: { distribution: { accountId: a }, bouncedAt: { gte: since } } }),
    db.coverage.findMany({ where: { accountId: a, deletedAt: null, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.conversation.findMany({ where: { accountId: a, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.release.findMany({ where: { accountId: a, deletedAt: null, status: "SCHEDULED", scheduledFor: { gte: now, lte: weekOut } }, include: { client: { select: { name: true } } }, orderBy: { scheduledFor: "asc" }, take: 50 }),
    db.activity.findMany({ where: { accountId: a, completedAt: null, dueAt: { lte: endOfToday } }, orderBy: { dueAt: "asc" }, take: 100 }),
    db.auditLog.groupBy({ by: ["userId"], where: { accountId: a, createdAt: { gte: since } }, _count: { _all: true } }),
    db.membership.findMany({ where: { accountId: a }, include: { user: { select: { id: true, name: true } } } }),
  ]);
  const nameOf = (id: string | null) => members.find((m: any) => m.userId === id)?.user.name ?? "Unknown";
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const doc = buildNeedToKnowDoc({
    accountName: v.account.name, generatedAt: now, since,
    emails: { delivered, opened, replied, bounced },
    coverage: coverage.map((c: any) => ({ outlet: c.outletName, headline: c.headline, url: c.url, sentiment: c.sentiment })),
    conversations: conversations.map((c: any) => ({ outlet: c.outletName, question: c.question, deadline: c.deadline, status: c.status })),
    upcomingReleases: releases.map((r: any) => ({ headline: r.headline, scheduledFor: r.scheduledFor, client: r.client?.name ?? null, url: base ? `${base}/releases/${r.id}` : null })),
    tasks: tasks.map((t: any) => ({ title: t.title, dueAt: t.dueAt, assignee: t.assigneeId ? nameOf(t.assigneeId) : null, overdue: !!t.dueAt && t.dueAt < startOfToday })),
    teamActivity: activity.map((x: any) => ({ name: nameOf(x.userId), count: x._count._all })).sort((x: any, y: any) => y.count - x.count),
  });
  const buf = await Packer.toBuffer(doc);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="need-to-know-${now.toISOString().slice(0, 10)}.docx"`,
    },
  });
}
