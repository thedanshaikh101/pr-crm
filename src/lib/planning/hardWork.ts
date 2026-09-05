// Per-teammate activity counts for Your Hard Work. Server-side (DB); shared by the page and the CSV route.
import { db } from "@/lib/db";

export const HARD_WORK_METRICS = [
  ["releasesCreated", "Releases created"], ["releasesPublished", "Releases published"], ["distributionsSent", "Distributions sent"], ["emailsSent", "Emails sent"],
  ["coverageLogged", "Coverage logged"], ["conversationsHandled", "Conversations handled"], ["statementsWritten", "Statements written"], ["tasksCompleted", "Tasks completed"], ["notesAdded", "Notes added"],
] as const;
export type HardWorkMetric = (typeof HARD_WORK_METRICS)[number][0];
export type HardWorkRow = { userId: string; name: string; email: string; role: string; jobTitle: string | null } & Record<HardWorkMetric, number>;

export async function hardWorkRows(accountId: string, from: Date, to: Date, clientId: string | null): Promise<HardWorkRow[]> {
  const inRange = { gte: from, lte: to };
  const client = clientId ? { clientId } : {};
  const clientRel = clientId ? { release: { clientId } } : {};
  const [members, relCreated, relPublished, dists, cov, conv, statements, tasks, notes, convNotes] = await Promise.all([
    db.membership.findMany({ where: { accountId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    db.release.groupBy({ by: ["createdById"], where: { accountId, deletedAt: null, createdAt: inRange, ...client }, _count: { _all: true } }),
    db.release.groupBy({ by: ["createdById"], where: { accountId, deletedAt: null, publishedAt: inRange, ...client }, _count: { _all: true } }),
    db.distribution.groupBy({ by: ["sentById"], where: { accountId, isTest: false, status: "SENT", createdAt: inRange, ...clientRel }, _count: { _all: true }, _sum: { recipientCount: true } }),
    db.coverage.groupBy({ by: ["createdById"], where: { accountId, deletedAt: null, createdAt: inRange, ...client }, _count: { _all: true } }),
    db.conversation.groupBy({ by: ["assigneeId"], where: { accountId, createdAt: inRange }, _count: { _all: true } }),
    db.auditLog.groupBy({ by: ["userId"], where: { accountId, createdAt: inRange, action: { in: ["statement.create", "statement.update", "statement.restore"] } }, _count: { _all: true } }),
    db.activity.groupBy({ by: ["assigneeId"], where: { accountId, completedAt: inRange }, _count: { _all: true } }),
    db.note.groupBy({ by: ["authorId"], where: { accountId, createdAt: inRange }, _count: { _all: true } }),
    db.conversationNote.groupBy({ by: ["authorId"], where: { conversation: { accountId }, createdAt: inRange }, _count: { _all: true } }),
  ]);
  const pick = (rows: any[], key: string, id: string, field = "_count") => { const r = rows.find((x) => x[key] === id); return r ? (field === "_count" ? r._count._all : r._sum.recipientCount ?? 0) : 0; };
  return members.map((m: any) => ({
    userId: m.userId, name: m.user.name, email: m.user.email, role: m.role, jobTitle: m.jobTitle,
    releasesCreated: pick(relCreated, "createdById", m.userId),
    releasesPublished: pick(relPublished, "createdById", m.userId),
    distributionsSent: pick(dists, "sentById", m.userId),
    emailsSent: pick(dists, "sentById", m.userId, "_sum"),
    coverageLogged: pick(cov, "createdById", m.userId),
    conversationsHandled: pick(conv, "assigneeId", m.userId),
    statementsWritten: pick(statements, "userId", m.userId),
    tasksCompleted: pick(tasks, "assigneeId", m.userId),
    notesAdded: pick(notes, "authorId", m.userId) + pick(convNotes, "authorId", m.userId),
  }));
}

export function hardWorkTotals(rows: HardWorkRow[]) {
  const t = {} as Record<HardWorkMetric, number>;
  for (const [k] of HARD_WORK_METRICS) t[k] = rows.reduce((n, r) => n + r[k], 0);
  return t;
}
