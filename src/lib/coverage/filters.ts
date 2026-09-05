import { z } from "zod";

/** Coverage list filter state. Lives in the URL; AND across groups, OR within a group. */
export const CoverageFilterSchema = z.object({
  q: z.string().optional(),
  sort: z.enum(["published", "reach", "ave", "outlet"]).default("published"),
  page: z.coerce.number().int().min(1).default(1),
  per: z.coerce.number().int().refine((n) => [25, 50, 100, 250].includes(n)).default(50),
  view: z.enum(["table", "cards"]).default("table"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  client: z.array(z.string()).default([]),
  release: z.array(z.string()).default([]),
  type: z.array(z.string()).default([]),
  focus: z.array(z.string()).default([]),
  sentiment: z.array(z.string()).default([]),
  tag: z.array(z.string()).default([]),
  org: z.array(z.string()).default([]),
  contact: z.array(z.string()).default([]),
  hasUrl: z.coerce.boolean().default(false),
});
export type CoverageFilters = z.infer<typeof CoverageFilterSchema>;

const ARRAY_KEYS = ["client", "release", "type", "focus", "sentiment", "tag", "org", "contact"];

export function parseFilters(sp: Record<string, string | string[] | undefined>): CoverageFilters {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    obj[k] = ARRAY_KEYS.includes(k)
      ? (Array.isArray(v) ? v : String(v).split(",").filter(Boolean))
      : Array.isArray(v) ? v[0] : v;
  }
  // Accept a single-value "clientId" alias used by report links.
  if (obj.clientId && !obj.client) obj.client = [String(obj.clientId)];
  if (obj.releaseId && !obj.release) obj.release = [String(obj.releaseId)];
  const r = CoverageFilterSchema.safeParse(obj);
  return r.success ? r.data : CoverageFilterSchema.parse({});
}

export function toQuery(f: Partial<CoverageFilters>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (Array.isArray(v)) { if (v.length) p.set(k, v.join(",")); continue; }
    if (k === "page" && v === 1) continue;
    if (k === "per" && v === 50) continue;
    if (k === "sort" && v === "published") continue;
    if (k === "view" && v === "table") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Count of active filters for the badge (excludes paging, sort, view, q). */
export function activeFilterCount(f: CoverageFilters) {
  let n = 0;
  if (f.from || f.to) n++;
  for (const k of ["client", "release", "type", "focus", "sentiment", "tag", "org", "contact"] as const) if (f[k].length) n++;
  if (f.hasUrl) n++;
  return n;
}

/** Start of the given YYYY-MM-DD in UTC, or end of day when `end` is true. */
export function dayBound(ymd: string, end = false) {
  const [y, m, d] = ymd.split("-").map(Number);
  return end ? new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)) : new Date(Date.UTC(y, m - 1, d));
}

/** Prisma where for top-level coverage items. Pure; accountId and deletedAt are always the first clause. */
export function buildCoverageWhere(f: CoverageFilters, accountId: string) {
  const and: any[] = [{ accountId, deletedAt: null }];
  and.push({ parentId: null });
  if (f.q) {
    const q = f.q.trim();
    and.push({ OR: [
      { headline: { contains: q, mode: "insensitive" } },
      { outletName: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
    ] });
  }
  if (f.from) and.push({ publishedAt: { gte: dayBound(f.from) } });
  if (f.to) and.push({ publishedAt: { lte: dayBound(f.to, true) } });
  if (f.client.length) and.push({ clientId: { in: f.client } });
  if (f.release.length) and.push({ releaseId: { in: f.release } });
  if (f.type.length) and.push({ type: { in: f.type } });
  if (f.focus.length) and.push({ focus: { in: f.focus } });
  if (f.sentiment.length) and.push({ sentiment: { in: f.sentiment } });
  if (f.tag.length) and.push({ tags: { some: { tagId: { in: f.tag } } } });
  if (f.org.length) and.push({ organizationId: { in: f.org } });
  if (f.contact.length) and.push({ contactId: { in: f.contact } });
  if (f.hasUrl) and.push({ url: { not: null } });
  return { AND: and };
}

export function orderFor(sort: CoverageFilters["sort"]): any {
  switch (sort) {
    case "reach": return [{ estimatedReach: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }];
    case "ave": return [{ adValue: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }];
    case "outlet": return [{ outletName: "asc" }, { publishedAt: "desc" }];
    default: return [{ publishedAt: "desc" }, { createdAt: "desc" }];
  }
}

export const COVERAGE_TYPES = ["BROADCAST", "ONLINE", "PRINT", "RADIO", "PODCAST", "SOCIAL"] as const;
export const COVERAGE_FOCUS = ["NATIONAL", "REGIONAL", "LOCAL", "TRADE", "INTERNATIONAL"] as const;
export const SENTIMENTS = ["POSITIVE", "NEUTRAL", "NEGATIVE"] as const;

export const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

export const DEFAULT_COLUMNS = [
  { key: "outlet", label: "Outlet", visible: true },
  { key: "headline", label: "Headline", visible: true },
  { key: "publishedAt", label: "Published", visible: true },
  { key: "type", label: "Type", visible: true },
  { key: "focus", label: "Focus", visible: true },
  { key: "sentiment", label: "Sentiment", visible: true },
  { key: "client", label: "Client", visible: true },
  { key: "release", label: "Release", visible: true },
  { key: "reach", label: "Reach", visible: true },
  { key: "ave", label: "AVE", visible: false },
  { key: "pickups", label: "Pickups", visible: true },
  { key: "tags", label: "Tags", visible: true },
];
