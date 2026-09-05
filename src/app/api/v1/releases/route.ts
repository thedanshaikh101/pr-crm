import { db } from "@/lib/db";
import { ApiHttpError, dateParam, paginate, pageResponse, withApiKey } from "@/lib/api/handler";
import { RELEASE_STATUSES } from "@/lib/api/schemas";
import { releaseOut } from "@/lib/api/serialize";
import { clientIdFor, releaseStatsFor } from "@/lib/api/releaseStats";

// GET /api/v1/releases?status=&client=&publishedSince=
export const GET = withApiKey(async ({ url, account }) => {
  const { page, per, skip } = paginate(url);
  const status = url.searchParams.get("status");
  if (status && !(RELEASE_STATUSES as readonly string[]).includes(status)) throw new ApiHttpError(400, `status must be one of ${RELEASE_STATUSES.join(", ")}`);
  const clientId = await clientIdFor(account.id, url.searchParams.get("client"));
  const publishedSince = dateParam(url, "publishedSince");
  const where: any = { accountId: account.id, deletedAt: null };
  if (status) where.status = status;
  if (clientId !== undefined) where.clientId = clientId ?? "__none__";
  if (publishedSince) where.publishedAt = { gte: publishedSince };
  const [total, data] = await Promise.all([
    db.release.count({ where }),
    db.release.findMany({ where, skip, take: per, orderBy: [{ publishedAt: { sort: "desc", nulls: "first" } }, { updatedAt: "desc" }], include: { client: { select: { id: true, name: true } } } }),
  ]);
  const stats = await releaseStatsFor(account.id, data.map((r: any) => r.id));
  return pageResponse(total, page, per, data.map((r: any) => releaseOut(r, account.slug, stats.get(r.id)!)));
});
