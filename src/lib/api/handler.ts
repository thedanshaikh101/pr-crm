// Shared plumbing for /api/v1: Bearer key auth, per-key rate limit, pagination, error shapes.
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createHash } from "crypto";
import { accountFromApiKey } from "./auth";
import { rateLimit } from "@/lib/ratelimit";
import { PlanLimitError } from "@/lib/plans";
import { paginate } from "./paginate";

export const API_RATE_MAX = 300;
export const API_RATE_WINDOW_MS = 60_000;
export { paginate, MAX_PER_PAGE, DEFAULT_PER_PAGE } from "./paginate";

export type ApiAccount = NonNullable<Awaited<ReturnType<typeof accountFromApiKey>>>;
export type ApiCtx = { req: Request; url: URL; account: ApiAccount; params: Record<string, string> };

export class ApiHttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function apiError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra ?? {}) }, { status });
}

export function pageResponse<T>(total: number, page: number, per: number, data: T[]) {
  return NextResponse.json({ total, page, per, pages: Math.max(1, Math.ceil(total / per)), data });
}

export async function readJson(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { throw new ApiHttpError(400, "Body must be valid JSON"); }
}

export function dateParam(url: URL, name: string): Date | undefined {
  const v = url.searchParams.get(name);
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ApiHttpError(400, `${name} must be an ISO 8601 date`);
  return d;
}

/**
 * Wrap a route handler: resolve the account from the Bearer key, rate limit per key,
 * and turn thrown zod / plan / ApiHttpError into JSON error responses.
 */
export function withApiKey(handler: (ctx: ApiCtx) => Promise<Response>) {
  return async (req: Request, route?: { params?: Record<string, string> }): Promise<Response> => {
    const raw = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("x-api-key");
    if (!raw) return apiError(401, "unauthorized");
    const keyId = createHash("sha256").update(raw).digest("hex").slice(0, 16);
    if (!(await rateLimit(`api:${keyId}`, API_RATE_MAX, API_RATE_WINDOW_MS))) {
      return NextResponse.json({ error: "rate limited", limit: API_RATE_MAX, windowSeconds: API_RATE_WINDOW_MS / 1000 }, { status: 429, headers: { "retry-after": String(API_RATE_WINDOW_MS / 1000) } });
    }
    const account = await accountFromApiKey(req);
    if (!account) return apiError(401, "unauthorized");
    try {
      return await handler({ req, url: new URL(req.url), account, params: route?.params ?? {} });
    } catch (e: any) {
      if (e instanceof ZodError) return apiError(400, "validation failed", { issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
      if (e instanceof PlanLimitError) return apiError(402, e.message, { limit: e.limit, max: e.max });
      if (e instanceof ApiHttpError) return apiError(e.status, e.message);
      console.error("[api/v1]", e?.message ?? e);
      return apiError(500, "internal error");
    }
  };
}
