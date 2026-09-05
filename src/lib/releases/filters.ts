import { z } from "zod";

/** Release list filter state lives in the URL. Shared by /releases and /newsletters. */
export const ReleaseFilterSchema = z.object({
  q: z.string().optional(),
  sort: z.enum(["updated", "published", "headline"]).default("updated"),
  page: z.coerce.number().int().min(1).default(1),
  per: z.coerce.number().int().refine((n) => [25, 50, 100, 250].includes(n)).default(25),
  status: z.array(z.enum(["DRAFT", "SCHEDULED", "LIVE", "ARCHIVED"])).default([]),
  client: z.array(z.string()).default([]),
  tag: z.array(z.string()).default([]),
  pro: z.array(z.enum(["PROACTIVE", "REACTIVE", "UNSET"])).default([]),
  view: z.enum(["table", "cards"]).default("cards"),
});
export type ReleaseFilters = z.infer<typeof ReleaseFilterSchema>;

const ARRAY_KEYS = ["status", "client", "tag", "pro"];

export function parseReleaseFilters(sp: Record<string, string | string[] | undefined>): ReleaseFilters {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    obj[k] = ARRAY_KEYS.includes(k) ? (Array.isArray(v) ? v : String(v).split(",").filter(Boolean)) : Array.isArray(v) ? v[0] : v;
  }
  const r = ReleaseFilterSchema.safeParse(obj);
  return r.success ? r.data : ReleaseFilterSchema.parse({});
}

export function toReleaseQuery(f: Partial<ReleaseFilters>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) { if (v.length) p.set(k, v.join(",")); continue; }
    if (k === "page" && v === 1) continue;
    if (k === "per" && v === 25) continue;
    if (k === "sort" && v === "updated") continue;
    if (k === "view" && v === "cards") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function activeReleaseFilterCount(f: ReleaseFilters) {
  let n = 0;
  for (const k of ["status", "client", "tag", "pro"] as const) if (f[k].length) n++;
  return n;
}

/** Prisma where for the release list. accountId is always the first AND clause and cannot come from the URL. */
export function buildReleaseWhere(f: ReleaseFilters, accountId: string, kind: "PRESS_RELEASE" | "NEWSLETTER") {
  const and: any[] = [{ accountId, kind, deletedAt: null }];
  if (f.q) and.push({ OR: [{ headline: { contains: f.q.trim(), mode: "insensitive" } }, { subheadline: { contains: f.q.trim(), mode: "insensitive" } }] });
  if (f.status.length) and.push({ status: { in: f.status } });
  if (f.client.length) and.push({ clientId: { in: f.client } });
  if (f.tag.length) and.push({ tags: { some: { tagId: { in: f.tag } } } });
  if (f.pro.length) and.push({ proactivity: { in: f.pro } });
  return { AND: and };
}

export function releaseOrderFor(sort: ReleaseFilters["sort"]): any {
  switch (sort) {
    case "published": return [{ publishedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }];
    case "headline": return [{ headline: "asc" }];
    default: return [{ updatedAt: "desc" }];
  }
}
