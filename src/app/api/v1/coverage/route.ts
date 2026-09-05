import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiHttpError, dateParam, paginate, pageResponse, readJson, withApiKey } from "@/lib/api/handler";
import { COVERAGE_TYPES, CoverageCreateBody } from "@/lib/api/schemas";
import { coverageOut } from "@/lib/api/serialize";
import { clientIdFor } from "@/lib/api/releaseStats";

// GET /api/v1/coverage?client=&release=&from=&to=&type=
export const GET = withApiKey(async ({ url, account }) => {
  const { page, per, skip } = paginate(url);
  const type = url.searchParams.get("type");
  if (type && !(COVERAGE_TYPES as readonly string[]).includes(type)) throw new ApiHttpError(400, `type must be one of ${COVERAGE_TYPES.join(", ")}`);
  const clientId = await clientIdFor(account.id, url.searchParams.get("client"));
  const from = dateParam(url, "from"), to = dateParam(url, "to");
  const where: any = { accountId: account.id, deletedAt: null };
  if (clientId !== undefined) where.clientId = clientId ?? "__none__";
  if (url.searchParams.get("release")) where.releaseId = url.searchParams.get("release");
  if (type) where.type = type;
  if (from || to) where.publishedAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const [total, data] = await Promise.all([db.coverage.count({ where }), db.coverage.findMany({ where, skip, take: per, orderBy: { publishedAt: "desc" } })]);
  return pageResponse(total, page, per, data.map(coverageOut));
});

// POST /api/v1/coverage
export const POST = withApiKey(async ({ req, account }) => {
  const body = CoverageCreateBody.parse(await readJson(req));
  if (body.clientId && !(await db.client.findFirst({ where: { id: body.clientId, accountId: account.id }, select: { id: true } }))) throw new ApiHttpError(400, "clientId does not belong to this account");
  if (body.releaseId && !(await db.release.findFirst({ where: { id: body.releaseId, accountId: account.id }, select: { id: true } }))) throw new ApiHttpError(400, "releaseId does not belong to this account");
  const owner = await db.membership.findFirst({ where: { accountId: account.id, deactivatedAt: null }, orderBy: [{ role: "asc" }, { createdAt: "asc" }], select: { userId: true } });
  if (!owner) throw new ApiHttpError(400, "account has no active members");
  const org = await db.organization.findFirst({ where: { accountId: account.id, name: { equals: body.outletName, mode: "insensitive" }, deletedAt: null }, select: { id: true } });
  const x = await db.coverage.create({
    data: {
      accountId: account.id, clientId: body.clientId ?? null, releaseId: body.releaseId ?? null, organizationId: org?.id ?? null,
      outletName: body.outletName, headline: body.headline, url: body.url ?? null, publishedAt: body.publishedAt, type: body.type,
      focus: body.focus ?? "NATIONAL", sentiment: body.sentiment ?? "NEUTRAL", estimatedReach: body.estimatedReach ?? null, adValue: body.adValue ?? null, createdById: owner.userId,
    },
  });
  await audit(account.id, null, "coverage.create", "coverage", x.id, { via: "api" });
  const data = coverageOut(x);
  const endpoints = await db.webhookEndpoint.findMany({ where: { accountId: account.id, active: true, events: { has: "coverage.created" } }, select: { id: true } });
  if (endpoints.length) {
    await db.webhookDelivery.createMany({ data: endpoints.map((e: any) => ({ endpointId: e.id, event: "coverage.created", payload: { event: "coverage.created", createdAt: new Date().toISOString(), data: { coverage: data } } as any, nextRetryAt: new Date() })) });
  }
  return NextResponse.json(data, { status: 201 });
});
