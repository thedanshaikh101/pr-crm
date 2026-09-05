import { z } from "zod";

/** Filter state lives in the URL. AND across groups, OR within a group. */
export const ContactFilterSchema = z.object({
  q: z.string().optional(),
  sort: z.enum(["updated", "name", "outlet", "followers"]).default("updated"),
  page: z.coerce.number().int().min(1).default(1),
  per: z.coerce.number().int().refine((n) => [25, 50, 100, 250].includes(n)).default(100),
  type: z.array(z.enum(["people", "orgs"])).default(["people"]),
  emailOnly: z.coerce.boolean().default(false),
  includeEx: z.coerce.boolean().default(false),
  org: z.array(z.string()).default([]),
  title: z.string().optional(),
  freq: z.array(z.string()).default([]),
  subject: z.array(z.string()).default([]),
  cls: z.array(z.string()).default([]),
  aud: z.array(z.string()).default([]),
  loc: z.string().optional(),
  lang: z.array(z.string()).default([]),
  daMin: z.coerce.number().optional(),
  daMax: z.coerce.number().optional(),
  method: z.array(z.enum(["email", "phone", "mobile", "social"])).default([]),
  tag: z.array(z.string()).default([]),
  imp: z.array(z.string()).default([]),
  owner: z.array(z.string()).default([]),
  list: z.array(z.string()).default([]),
  noList: z.coerce.boolean().default(false),
  mine: z.coerce.boolean().default(false),
  view: z.enum(["table", "cards"]).default("table"),
});
export type ContactFilters = z.infer<typeof ContactFilterSchema>;

const ARRAY_KEYS = ["type", "org", "freq", "subject", "cls", "aud", "lang", "method", "tag", "imp", "owner", "list"];

export function parseFilters(sp: Record<string, string | string[] | undefined>): ContactFilters {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    obj[k] = ARRAY_KEYS.includes(k)
      ? (Array.isArray(v) ? v : String(v).split(",").filter(Boolean))
      : Array.isArray(v) ? v[0] : v;
  }
  if (Array.isArray(obj.type) && obj.type.length === 0) delete obj.type;
  const r = ContactFilterSchema.safeParse(obj);
  return r.success ? r.data : ContactFilterSchema.parse({});
}

export function toQuery(f: Partial<ContactFilters>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (Array.isArray(v)) { if (v.length) p.set(k, v.join(",")); continue; }
    if (k === "page" && v === 1) continue;
    if (k === "per" && v === 100) continue;
    if (k === "sort" && v === "updated") continue;
    if (k === "view" && v === "table") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Count of active filters for the badge (excludes paging, sort, view, q). */
export function activeFilterCount(f: ContactFilters) {
  let n = 0;
  if (!(f.type.length === 1 && f.type[0] === "people")) n++;
  if (f.emailOnly) n++;
  if (f.includeEx) n++;
  for (const k of ["org", "freq", "subject", "cls", "aud", "lang", "method", "tag", "imp", "owner", "list"] as const) if (f[k].length) n++;
  if (f.title) n++;
  if (f.loc) n++;
  if (f.daMin !== undefined || f.daMax !== undefined) n++;
  if (f.noList) n++;
  if (f.mine) n++;
  return n;
}

/** Build a Prisma where clause. Pure so it is unit-testable; accountId is always injected first. */
export function buildContactWhere(f: ContactFilters, accountId: string, userId: string) {
  const and: any[] = [{ accountId, deletedAt: null, mergedIntoId: null }];
  and.push({ OR: [{ visibility: "SHARED" }, { ownerId: userId }] });
  if (f.q) {
    const q = f.q.trim();
    and.push({ OR: [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { jobTitle: { contains: q, mode: "insensitive" } },
      { organization: { name: { contains: q, mode: "insensitive" } } },
      { searchText: { contains: q, mode: "insensitive" } },
    ] });
  }
  if (f.emailOnly) and.push({ email: { not: null } });
  if (!f.includeEx) and.push({ isExJournalist: false });
  if (f.org.length) and.push({ organizationId: { in: f.org } });
  if (f.title) and.push({ jobTitle: { contains: f.title, mode: "insensitive" } });
  if (f.freq.length) and.push({ organization: { frequency: { in: f.freq } } });
  if (f.subject.length) and.push({ subjects: { some: { subject: { OR: f.subject.map((s) => ({ path: { startsWith: s } })) } } } });
  if (f.cls.length) and.push({ classifications: { hasSome: f.cls } });
  if (f.aud.length) and.push({ audienceLocation: { hasSome: f.aud } });
  if (f.loc) and.push({ physicalLocation: { contains: f.loc, mode: "insensitive" } });
  if (f.lang.length) and.push({ language: { in: f.lang } });
  if (f.daMin !== undefined || f.daMax !== undefined)
    and.push({ organization: { domainAuthority: { gte: f.daMin ?? 0, lte: f.daMax ?? 100 } } });
  if (f.method.length) {
    const or: any[] = [];
    if (f.method.includes("email")) or.push({ email: { not: null } });
    if (f.method.includes("phone")) or.push({ landline: { not: null } });
    if (f.method.includes("mobile")) or.push({ mobile: { not: null } });
    if (f.method.includes("social")) or.push({ xHandle: { not: null } });
    and.push({ OR: or });
  }
  if (f.tag.length) and.push({ tags: { some: { tagId: { in: f.tag } } } });
  if (f.imp.length) and.push({ importance: { in: f.imp } });
  if (f.owner.length) and.push({ ownerId: { in: f.owner } });
  if (f.list.length) and.push({ listMembers: { some: { listId: { in: f.list } } } });
  if (f.noList) and.push({ listMembers: { none: {} } });
  if (f.mine) and.push({ OR: [{ ownerId: userId }, { recipients: { some: { distribution: { sentById: userId } } } }] });
  return { AND: and };
}

export function orderFor(sort: ContactFilters["sort"]): any {
  switch (sort) {
    case "name": return [{ lastName: "asc" }, { firstName: "asc" }];
    case "outlet": return [{ organization: { name: "asc" } }, { lastName: "asc" }];
    case "followers": return [{ xFollowers: { sort: "desc", nulls: "last" } }];
    default: return [{ updatedAt: "desc" }];
  }
}

export const CLASSIFICATIONS = [
  "Television", "Radio", "Newspaper - National", "Newspaper - Regional", "Publications - Consumer (B2C)",
  "Publications - Trade (B2B)", "Podcast", "Blog", "News Source (syndicated news & wires)", "Freelancer", "Online", "In Between Roles",
];
export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL", "CONTINUOUS"];
export const IMPORTANCE = ["NOT_RANKED", "LOW", "MEDIUM", "HIGH", "VIP"];

export const DEFAULT_COLUMNS = [
  { key: "name", label: "Name", visible: true },
  { key: "outlet", label: "Outlet", visible: true },
  { key: "jobTitle", label: "Job title", visible: true },
  { key: "xBio", label: "X bio", visible: true },
  { key: "subjects", label: "Subjects", visible: true },
  { key: "xFollowers", label: "X followers", visible: true },
  { key: "classification", label: "Classification", visible: true },
  { key: "inList", label: "In-List", visible: true },
  { key: "audienceLocation", label: "Audience location", visible: false },
  { key: "domainAuthority", label: "Domain authority", visible: false },
  { key: "email", label: "Email address", visible: false },
  { key: "landline", label: "Landline number", visible: false },
  { key: "mobile", label: "Mobile number", visible: false },
  { key: "significantUpdate", label: "Significant update", visible: false },
];
