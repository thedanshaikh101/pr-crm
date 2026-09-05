// Per-release send stats aggregated from DistributionRecipient, in three grouped queries.
import { db } from "@/lib/db";
import type { ReleaseStats } from "./serialize";

export async function releaseStatsFor(accountId: string, releaseIds: string[]): Promise<Map<string, ReleaseStats>> {
  const out = new Map<string, ReleaseStats>();
  for (const id of releaseIds) out.set(id, { sent: 0, delivered: 0, opened: 0 });
  if (!releaseIds.length) return out;
  const dists = await db.distribution.findMany({ where: { accountId, releaseId: { in: releaseIds }, isTest: false }, select: { id: true, releaseId: true } });
  if (!dists.length) return out;
  const toRelease = new Map(dists.map((d: any) => [d.id as string, d.releaseId as string]));
  const distIds = Array.from(toRelease.keys());
  const [sent, delivered, opened] = await Promise.all([
    db.distributionRecipient.groupBy({ by: ["distributionId"], where: { distributionId: { in: distIds } }, _count: { _all: true } }),
    db.distributionRecipient.groupBy({ by: ["distributionId"], where: { distributionId: { in: distIds }, deliveredAt: { not: null } }, _count: { _all: true } }),
    db.distributionRecipient.groupBy({ by: ["distributionId"], where: { distributionId: { in: distIds }, firstOpenAt: { not: null } }, _count: { _all: true } }),
  ]);
  const add = (rows: any[], key: keyof ReleaseStats) => { for (const r of rows) { const rid = toRelease.get(r.distributionId); if (!rid) continue; const s = out.get(rid)!; s[key] += r._count._all; } };
  add(sent, "sent"); add(delivered, "delivered"); add(opened, "opened");
  return out;
}

export async function clientIdFor(accountId: string, clientParam: string | null): Promise<string | null | undefined> {
  if (!clientParam) return undefined;
  const c = await db.client.findFirst({ where: { accountId, OR: [{ id: clientParam }, { name: { equals: clientParam, mode: "insensitive" } }] }, select: { id: true } });
  return c?.id ?? null;
}
