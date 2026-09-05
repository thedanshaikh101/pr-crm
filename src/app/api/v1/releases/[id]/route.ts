import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiHttpError, withApiKey } from "@/lib/api/handler";
import { releaseOut } from "@/lib/api/serialize";
import { releaseStatsFor } from "@/lib/api/releaseStats";

// GET /api/v1/releases/{id}
export const GET = withApiKey(async ({ account, params }) => {
  const r = await db.release.findFirst({
    where: { id: params.id, accountId: account.id, deletedAt: null },
    include: {
      client: { select: { id: true, name: true } }, tags: { include: { tag: { select: { name: true } } } },
      distributions: { where: { isTest: false }, orderBy: { createdAt: "desc" }, select: { id: true, label: true, status: true, subject: true, recipientCount: true, startedAt: true, completedAt: true,
        _count: { select: { recipients: { where: { deliveredAt: { not: null } } } } } } },
    },
  });
  if (!r) throw new ApiHttpError(404, "release not found");
  const stats = (await releaseStatsFor(account.id, [r.id])).get(r.id)!;
  const distIds = r.distributions.map((d: any) => d.id);
  const [opened, bounced] = distIds.length ? await Promise.all([
    db.distributionRecipient.groupBy({ by: ["distributionId"], where: { distributionId: { in: distIds }, firstOpenAt: { not: null } }, _count: { _all: true } }),
    db.distributionRecipient.groupBy({ by: ["distributionId"], where: { distributionId: { in: distIds }, bouncedAt: { not: null } }, _count: { _all: true } }),
  ]) : [[], []];
  const n = (rows: any[], id: string) => rows.find((x) => x.distributionId === id)?._count._all ?? 0;
  return NextResponse.json({
    ...releaseOut(r, account.slug, stats),
    subheadline: r.subheadline ?? null, body: r.body, tags: r.tags.map((t: any) => t.tag.name),
    distributions: r.distributions.map((d: any) => ({ id: d.id, label: d.label, status: d.status, subject: d.subject, recipientCount: d.recipientCount, delivered: d._count.recipients, opened: n(opened, d.id), bounced: n(bounced, d.id), startedAt: d.startedAt, completedAt: d.completedAt })),
  });
});
