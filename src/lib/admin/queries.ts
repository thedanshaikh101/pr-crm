// DB queries for the super-admin screens. Cross-tenant by design; only reachable behind isSuperAdmin.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type RecipientAgg = { accountId: string; delivered: number; bounced: number; complained: number };

/** Delivered / bounced / complained per account over distributions created in the last `days`. */
export async function recipientAggregates(days = 30, accountId?: string): Promise<Map<string, RecipientAgg>> {
  const since = new Date(Date.now() - days * 864e5);
  const rows = await db.$queryRaw<{ accountId: string; delivered: bigint; bounced: bigint; complained: bigint }[]>(Prisma.sql`
    SELECT d."accountId" AS "accountId",
           COUNT(r."deliveredAt") AS delivered,
           COUNT(r."bouncedAt") AS bounced,
           COUNT(r."complainedAt") AS complained
    FROM "DistributionRecipient" r
    JOIN "Distribution" d ON d.id = r."distributionId"
    WHERE d."createdAt" >= ${since} AND d."isTest" = false ${accountId ? Prisma.sql`AND d."accountId" = ${accountId}` : Prisma.empty}
    GROUP BY d."accountId"`);
  const out = new Map<string, RecipientAgg>();
  for (const r of rows) out.set(r.accountId, { accountId: r.accountId, delivered: Number(r.delivered), bounced: Number(r.bounced), complained: Number(r.complained) });
  return out;
}

export function currentPeriod(d = new Date()) {
  return d.toISOString().slice(0, 7);
}
