"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireRole, requireViewer } from "@/lib/auth";
import { fetchArticleMeta } from "@/lib/coverage/fetch";
import { hostnameOf, splitName, type ArticleMeta } from "@/lib/coverage/extract";
import { COVERAGE_FOCUS, COVERAGE_TYPES, SENTIMENTS } from "@/lib/coverage/filters";

// ------------------------------------------------------------ input

const opt = (max = 500) => z.string().trim().max(max).optional().transform((s) => (s ? s : null));
const optUrl = z.string().trim().max(2000).optional().transform((s) => (s ? s : null)).refine((s) => !s || /^https?:\/\//i.test(s), "Must start with http:// or https://");

const CoverageInput = z.object({
  outletName: z.string().trim().min(1, "Outlet is required").max(200),
  headline: z.string().trim().min(1, "Headline is required").max(500),
  url: optUrl,
  publishedAt: z.string().trim().min(1, "Published date is required"),
  type: z.enum(COVERAGE_TYPES).default("ONLINE"),
  focus: z.enum(COVERAGE_FOCUS).default("NATIONAL"),
  sentiment: z.enum(SENTIMENTS).default("NEUTRAL"),
  summary: opt(2000),
  notes: opt(20000),
  estimatedReach: z.string().trim().optional().transform((s) => (s ? Math.max(0, Math.round(Number(s.replace(/[, ]/g, "")))) : null)).refine((n) => n === null || Number.isFinite(n), "Reach must be a number"),
  adValue: z.string().trim().optional().transform((s) => (s ? Number(s.replace(/[$, ]/g, "")) : null)).refine((n) => n === null || Number.isFinite(n), "AVE must be a number"),
  imageUrl: optUrl,
  outletLogoUrl: optUrl,
  clientId: opt(64),
  releaseId: opt(64),
  organizationId: opt(64),
  contactId: opt(64),
  newTags: opt(500),
});

/** Zod parse that surfaces the first field message as a plain Error. */
function parseInput<T>(schema: z.ZodType<T, z.ZodTypeDef, any>, input: unknown): T {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const i = r.error.issues[0];
  throw new Error(i ? `${i.path.join(".") || "Form"}: ${i.message}` : "Invalid input");
}

function parseDate(s: string) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T12:00:00Z") : new Date(s);
  if (isNaN(d.getTime())) throw new Error("Published date is not valid");
  return d;
}

/** Validate optional foreign keys belong to this account; returns null for unknown ids. */
async function ownedIds(accountId: string, d: { clientId: string | null; releaseId: string | null; organizationId: string | null; contactId: string | null }) {
  const [client, release, org, contact] = await Promise.all([
    d.clientId ? db.client.findFirst({ where: { id: d.clientId, accountId }, select: { id: true } }) : null,
    d.releaseId ? db.release.findFirst({ where: { id: d.releaseId, accountId }, select: { id: true } }) : null,
    d.organizationId ? db.organization.findFirst({ where: { id: d.organizationId, accountId }, select: { id: true } }) : null,
    d.contactId ? db.contact.findFirst({ where: { id: d.contactId, accountId }, select: { id: true } }) : null,
  ]);
  return { clientId: client?.id ?? null, releaseId: release?.id ?? null, organizationId: org?.id ?? null, contactId: contact?.id ?? null };
}

async function tagIdsFor(accountId: string, existing: string[], newTags: string | null) {
  const names = (newTags ?? "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const created: string[] = [];
  for (const name of names) {
    const t = await db.tag.upsert({ where: { accountId_name: { accountId, name } }, create: { accountId, name }, update: {} });
    created.push(t.id);
  }
  const owned = existing.length ? await db.tag.findMany({ where: { accountId, id: { in: existing } }, select: { id: true } }) : [];
  return Array.from(new Set([...owned.map((t: any) => t.id), ...created]));
}

async function notifyWebhooks(accountId: string, coverage: { id: string; headline: string; outletName: string; url: string | null }) {
  const endpoints = await db.webhookEndpoint.findMany({ where: { accountId, active: true, events: { has: "coverage.created" } }, select: { id: true } });
  if (!endpoints.length) return;
  await db.webhookDelivery.createMany({ data: endpoints.map((e: any) => ({ endpointId: e.id, event: "coverage.created", payload: { coverageId: coverage.id, headline: coverage.headline, outletName: coverage.outletName, url: coverage.url }, nextRetryAt: new Date() })) });
}

async function syncPickupCount(parentId: string) {
  const n = await db.coverage.count({ where: { parentId, deletedAt: null } });
  await db.coverage.update({ where: { id: parentId }, data: { pickupCount: n } });
}

// ------------------------------------------------------------ create / update / delete

export async function createCoverage(form: FormData) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const data = parseInput(CoverageInput, Object.fromEntries(form));
  const tagIds = form.getAll("tagIds").map(String).filter(Boolean);
  const fk = await ownedIds(v.account.id, data);
  const allTags = await tagIdsFor(v.account.id, tagIds, data.newTags);
  const c = await db.coverage.create({ data: {
    accountId: v.account.id, ...fk,
    outletName: data.outletName, headline: data.headline, url: data.url, publishedAt: parseDate(data.publishedAt),
    type: data.type, focus: data.focus, sentiment: data.sentiment, summary: data.summary, notes: data.notes,
    estimatedReach: data.estimatedReach, adValue: data.adValue, imageUrl: data.imageUrl, outletLogoUrl: data.outletLogoUrl,
    createdById: v.user.id, tags: { create: allTags.map((tagId) => ({ tagId })) },
  } });
  await audit(v.account.id, v.user.id, "coverage.create", "coverage", c.id, { headline: c.headline, outlet: c.outletName });
  await notifyWebhooks(v.account.id, c);
  revalidatePath("/coverage");
  redirect(`/coverage/${c.id}`);
}

export async function updateCoverage(id: string, form: FormData) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const existing = await db.coverage.findFirst({ where: { id, accountId: v.account.id, deletedAt: null }, select: { id: true } });
  if (!existing) throw new Error("Coverage item not found");
  const data = parseInput(CoverageInput, Object.fromEntries(form));
  const tagIds = form.getAll("tagIds").map(String).filter(Boolean);
  const fk = await ownedIds(v.account.id, data);
  const allTags = await tagIdsFor(v.account.id, tagIds, data.newTags);
  await db.coverage.update({ where: { id }, data: {
    ...fk,
    outletName: data.outletName, headline: data.headline, url: data.url, publishedAt: parseDate(data.publishedAt),
    type: data.type, focus: data.focus, sentiment: data.sentiment, summary: data.summary, notes: data.notes,
    estimatedReach: data.estimatedReach, adValue: data.adValue, imageUrl: data.imageUrl, outletLogoUrl: data.outletLogoUrl,
    tags: { deleteMany: {}, create: allTags.map((tagId) => ({ tagId })) },
  } });
  await audit(v.account.id, v.user.id, "coverage.update", "coverage", id, { fields: Object.keys(data) });
  revalidatePath(`/coverage/${id}`);
  revalidatePath("/coverage");
  redirect(`/coverage/${id}`);
}

export async function deleteCoverage(ids: string[]) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const rows = await db.coverage.findMany({ where: { id: { in: ids }, accountId: v.account.id }, select: { id: true, parentId: true } });
  const owned = rows.map((r: any) => r.id);
  if (!owned.length) return;
  await db.coverage.updateMany({ where: { OR: [{ id: { in: owned } }, { parentId: { in: owned } }], accountId: v.account.id }, data: { deletedAt: new Date() } });
  for (const p of Array.from(new Set(rows.map((r: any) => r.parentId).filter(Boolean))) as string[]) await syncPickupCount(p);
  await audit(v.account.id, v.user.id, "coverage.delete", "coverage", undefined, { ids: owned });
  revalidatePath("/coverage");
  for (const p of rows) if (p.parentId) revalidatePath(`/coverage/${p.parentId}`);
}

export async function restoreCoverage(ids: string[]) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const rows = await db.coverage.findMany({ where: { id: { in: ids }, accountId: v.account.id }, select: { id: true, parentId: true } });
  await db.coverage.updateMany({ where: { id: { in: rows.map((r: any) => r.id) }, accountId: v.account.id }, data: { deletedAt: null } });
  for (const p of Array.from(new Set(rows.map((r: any) => r.parentId).filter(Boolean))) as string[]) await syncPickupCount(p);
  await audit(v.account.id, v.user.id, "coverage.restore", "coverage", undefined, { ids });
  revalidatePath("/coverage");
}

// ------------------------------------------------------------ pickups

const PickupInput = z.object({
  outletName: z.string().trim().min(1, "Outlet is required").max(200),
  headline: z.string().trim().max(500).optional().transform((s) => s || null),
  url: optUrl,
  publishedAt: z.string().trim().optional().transform((s) => s || null),
});

export async function addPickup(parentId: string, form: FormData) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const parent = await db.coverage.findFirst({ where: { id: parentId, accountId: v.account.id, deletedAt: null } });
  if (!parent) throw new Error("Coverage item not found");
  if (parent.parentId) throw new Error("Pickups cannot have pickups of their own");
  const d = parseInput(PickupInput, Object.fromEntries(form));
  const c = await db.coverage.create({ data: {
    accountId: v.account.id, parentId, clientId: parent.clientId, releaseId: parent.releaseId,
    outletName: d.outletName, headline: d.headline ?? parent.headline, url: d.url, publishedAt: d.publishedAt ? parseDate(d.publishedAt) : parent.publishedAt,
    type: parent.type, focus: parent.focus, sentiment: parent.sentiment, createdById: v.user.id,
  } });
  await syncPickupCount(parentId);
  await audit(v.account.id, v.user.id, "coverage.pickup.add", "coverage", c.id, { parentId, outlet: c.outletName });
  revalidatePath(`/coverage/${parentId}`);
}

export async function removePickup(parentId: string, pickupId: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  await db.coverage.updateMany({ where: { id: pickupId, parentId, accountId: v.account.id }, data: { deletedAt: new Date() } });
  await syncPickupCount(parentId);
  await audit(v.account.id, v.user.id, "coverage.pickup.remove", "coverage", pickupId, { parentId });
  revalidatePath(`/coverage/${parentId}`);
}

// ------------------------------------------------------------ bulk

export async function bulkTagCoverage(ids: string[], tagName: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const name = tagName.trim();
  if (!name) return;
  const tag = await db.tag.upsert({ where: { accountId_name: { accountId: v.account.id, name } }, create: { accountId: v.account.id, name }, update: {} });
  const owned = await db.coverage.findMany({ where: { id: { in: ids }, accountId: v.account.id }, select: { id: true } });
  await db.coverageTag.createMany({ data: owned.map((c: any) => ({ coverageId: c.id, tagId: tag.id })), skipDuplicates: true });
  await audit(v.account.id, v.user.id, "coverage.tag", "coverage", undefined, { ids: owned.map((c: any) => c.id), tag: name });
  revalidatePath("/coverage");
}

export async function bulkSetClient(ids: string[], clientId: string | null) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  if (clientId) {
    const c = await db.client.findFirst({ where: { id: clientId, accountId: v.account.id }, select: { id: true } });
    if (!c) throw new Error("Client not found");
  }
  await db.coverage.updateMany({ where: { id: { in: ids }, accountId: v.account.id }, data: { clientId } });
  await audit(v.account.id, v.user.id, "coverage.set_client", "coverage", undefined, { ids, clientId });
  revalidatePath("/coverage");
}

// ------------------------------------------------------------ URL import

export type CoverageMetaResult = ArticleMeta & {
  organizations: { id: string; name: string }[];
  contacts: { id: string; name: string }[];
  error?: string;
};

async function suggestOrganizations(accountId: string, url: string, outlet: string | null) {
  const host = hostnameOf(url);
  const base = host.split(".").slice(-2).join(".");
  const or: any[] = [];
  if (host) or.push({ domain: { contains: base, mode: "insensitive" } }, { website: { contains: base, mode: "insensitive" } });
  if (outlet) or.push({ name: { equals: outlet, mode: "insensitive" } });
  if (!or.length) return [];
  const rows = await db.organization.findMany({ where: { accountId, deletedAt: null, OR: or }, select: { id: true, name: true, domain: true, website: true }, take: 10 });
  const score = (o: any) => {
    const d = (o.domain ?? hostnameOf(o.website ?? "")).replace(/^www\./, "").toLowerCase();
    if (d && d === host) return 0;
    if (o.name && outlet && o.name.toLowerCase() === outlet.toLowerCase()) return 1;
    return 2;
  };
  return rows.sort((a: any, b: any) => score(a) - score(b)).slice(0, 5).map((o: any) => ({ id: o.id, name: o.name }));
}

async function suggestContacts(accountId: string, author: string | null) {
  if (!author) return [];
  const out: { id: string; name: string }[] = [];
  for (const raw of author.split(/\s+and\s+|,|&/i).map((s) => s.trim()).filter(Boolean).slice(0, 3)) {
    const n = splitName(raw);
    if (!n) continue;
    const where: any = n.last
      ? { accountId, deletedAt: null, firstName: { equals: n.first, mode: "insensitive" }, lastName: { equals: n.last, mode: "insensitive" } }
      : { accountId, deletedAt: null, OR: [{ firstName: { equals: n.first, mode: "insensitive" } }, { lastName: { equals: n.first, mode: "insensitive" } }] };
    const rows = await db.contact.findMany({ where, select: { id: true, firstName: true, lastName: true }, take: 5 });
    for (const c of rows) if (!out.some((x) => x.id === c.id)) out.push({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim() });
  }
  return out.slice(0, 5);
}

/** Fetch a page server-side and return extracted metadata plus outlet and author suggestions from this account. */
export async function fetchCoverageMeta(url: string): Promise<CoverageMetaResult> {
  const v = await requireViewer();
  const empty: ArticleMeta = { title: null, outlet: null, publishedAt: null, image: null, author: null, description: null, canonicalUrl: url };
  try {
    const meta = await fetchArticleMeta(url);
    const [organizations, contacts] = await Promise.all([suggestOrganizations(v.account.id, meta.canonicalUrl, meta.outlet), suggestContacts(v.account.id, meta.author)]);
    return { ...meta, organizations, contacts };
  } catch (e) {
    const organizations = await suggestOrganizations(v.account.id, url, null).catch(() => []);
    return { ...empty, outlet: hostnameOf(url) || null, organizations, contacts: [], error: (e as Error).message };
  }
}

export type ImportDefaults = { clientId?: string | null; releaseId?: string | null; type?: string | null };
export type ImportLineResult = { url: string; ok: boolean; id?: string; headline?: string; outlet?: string; reason?: string };

/** Paste-in list of URLs, one per line. Best effort and sequential; each line gets a result. */
export async function importCoverageUrls(text: string, defaults: ImportDefaults): Promise<ImportLineResult[]> {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const lines = Array.from(new Set(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))).slice(0, 50);
  const fk = await ownedIds(v.account.id, { clientId: defaults.clientId ?? null, releaseId: defaults.releaseId ?? null, organizationId: null, contactId: null });
  const type = (COVERAGE_TYPES as readonly string[]).includes(defaults.type ?? "") ? (defaults.type as (typeof COVERAGE_TYPES)[number]) : "ONLINE";
  const results: ImportLineResult[] = [];
  for (const line of lines) {
    const url = /^https?:\/\//i.test(line) ? line : `https://${line}`;
    try {
      const meta = await fetchArticleMeta(url);
      if (!meta.title) throw new Error("No title found on the page");
      const dup = await db.coverage.findFirst({ where: { accountId: v.account.id, deletedAt: null, url: { in: [url, meta.canonicalUrl] } }, select: { id: true } });
      if (dup) { results.push({ url, ok: false, id: dup.id, reason: "Already logged" }); continue; }
      const orgs = await suggestOrganizations(v.account.id, meta.canonicalUrl, meta.outlet);
      const c = await db.coverage.create({ data: {
        accountId: v.account.id, clientId: fk.clientId, releaseId: fk.releaseId, organizationId: orgs[0]?.id ?? null,
        outletName: meta.outlet ?? hostnameOf(url), headline: meta.title, url: meta.canonicalUrl, publishedAt: meta.publishedAt ? new Date(meta.publishedAt) : new Date(),
        type, summary: meta.description, imageUrl: meta.image, createdById: v.user.id,
      } });
      await audit(v.account.id, v.user.id, "coverage.create", "coverage", c.id, { headline: c.headline, outlet: c.outletName, via: "paste" });
      await notifyWebhooks(v.account.id, c);
      results.push({ url, ok: true, id: c.id, headline: c.headline, outlet: c.outletName });
    } catch (e) {
      results.push({ url, ok: false, reason: (e as Error).message });
    }
  }
  revalidatePath("/coverage");
  return results;
}
