"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireRole, requireViewer } from "@/lib/auth";
import { cleanHtml } from "@/lib/html";
import { newStorageKey, presignedPut, urlFor } from "@/lib/storage";
import { localToUtc } from "@/lib/releases/schedule";
import { parseBlocks } from "@/lib/releases/blocks";
import { renderReleaseHtml } from "@/lib/releases/render";
import { basePath, blocksColumnFor, buildRenderInput, newsroomUrl, readMediaContactId, RELEASE_INCLUDE, snapshotOf, uniqueSlug, type Kind } from "@/lib/releases/data";

const KindSchema = z.enum(["PRESS_RELEASE", "NEWSLETTER"]);

const ReleaseInput = z.object({
  kind: KindSchema.default("PRESS_RELEASE"),
  headline: z.string().trim().min(1, "Headline is required").max(300),
  subheadline: z.string().trim().max(400).optional(),
  datelineCity: z.string().trim().max(80).optional(),
  datelineDate: z.string().optional(),
  body: z.string().default(""),
  blocks: z.string().optional(),
  boilerplateId: z.string().optional(),
  footerId: z.string().optional(),
  mediaContactId: z.string().optional(),
  featuredImageUrl: z.string().trim().optional(),
  clientId: z.string().optional(),
  proactivity: z.enum(["PROACTIVE", "REACTIVE", "UNSET"]).default("UNSET"),
  embargoUntil: z.string().optional(),
  slug: z.string().trim().optional(),
  tagIds: z.array(z.string()).default([]),
  newTags: z.string().optional(),
  assetIds: z.array(z.string()).default([]),
  intent: z.enum(["save", "publish", "autosave"]).default("save"),
});
type ReleaseData = z.infer<typeof ReleaseInput>;

function fromForm(fd: FormData): ReleaseData {
  const obj: Record<string, unknown> = Object.fromEntries(fd);
  obj.tagIds = fd.getAll("tagIds").map(String).filter(Boolean);
  obj.assetIds = fd.getAll("assetIds").map(String).filter(Boolean);
  return ReleaseInput.parse(obj);
}

async function ownedIds(accountId: string, table: "boilerplate" | "tag" | "asset" | "client", ids: string[]) {
  if (!ids.length) return [] as string[];
  const rows: { id: string }[] = await (db as any)[table].findMany({ where: { accountId, id: { in: ids } }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Validate every referenced id belongs to the account and turn the form into a Prisma patch. */
async function toPatch(accountId: string, tz: string, d: ReleaseData, excludeId?: string) {
  const [bp, tags, assets, clients] = await Promise.all([
    ownedIds(accountId, "boilerplate", [d.boilerplateId, d.footerId, d.mediaContactId].filter(Boolean) as string[]),
    ownedIds(accountId, "tag", d.tagIds),
    ownedIds(accountId, "asset", d.assetIds),
    ownedIds(accountId, "client", d.clientId ? [d.clientId] : []),
  ]);
  const ok = (id?: string) => (id && bp.includes(id) ? id : null);
  const newTagIds: string[] = [];
  for (const name of (d.newTags ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const t = await db.tag.upsert({ where: { accountId_name: { accountId, name } }, create: { accountId, name }, update: {} });
    newTagIds.push(t.id);
  }
  const blocks = d.kind === "NEWSLETTER" ? parseBlocks(safeJson(d.blocks)) : [];
  const slug = await uniqueSlug(accountId, d.slug || d.headline, excludeId);
  const datelineDate = d.datelineDate ? new Date(d.datelineDate) : null;
  return {
    data: {
      kind: d.kind, headline: d.headline, subheadline: d.subheadline || null, datelineCity: d.datelineCity || null,
      datelineDate: datelineDate && !isNaN(datelineDate.getTime()) ? datelineDate : null,
      body: cleanHtml(d.body), blocks: blocksColumnFor(d.kind, blocks, ok(d.mediaContactId)) as any,
      boilerplateId: ok(d.boilerplateId), footerId: ok(d.footerId), featuredImageUrl: d.featuredImageUrl || null,
      clientId: clients[0] ?? null, proactivity: d.proactivity, embargoUntil: d.embargoUntil ? localToUtc(d.embargoUntil, tz) : null, slug,
    },
    tagIds: Array.from(new Set([...tags, ...newTagIds])),
    assetIds: assets,
  };
}

function safeJson(s?: string) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

async function getOwned(accountId: string, id: string) {
  const r = await db.release.findFirst({ where: { id, accountId, deletedAt: null }, include: RELEASE_INCLUDE });
  if (!r) throw new Error("Release not found");
  return r;
}

async function writeVersion(releaseId: string, userId: string) {
  const r = await db.release.findUnique({ where: { id: releaseId }, include: { tags: true, attachments: true } });
  const last = await db.releaseVersion.findFirst({ where: { releaseId }, orderBy: { version: "desc" }, select: { version: true } });
  return db.releaseVersion.create({ data: { releaseId, version: (last?.version ?? 0) + 1, snapshot: snapshotOf(r) as any, savedById: userId } });
}

// ------------------------------------------------------------ create / update

export async function createRelease(fd: FormData) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const d = fromForm(fd);
  const { data, tagIds, assetIds } = await toPatch(v.account.id, v.account.timezone, d);
  const r = await db.release.create({ data: { ...data, accountId: v.account.id, createdById: v.user.id, updatedById: v.user.id, tags: { create: tagIds.map((tagId) => ({ tagId })) }, attachments: { create: assetIds.map((assetId) => ({ assetId })) } } });
  await writeVersion(r.id, v.user.id);
  await audit(v.account.id, v.user.id, "release.create", "release", r.id, { kind: d.kind });
  if (d.intent === "publish") { await publishRelease(r.id); return; }
  redirect(`${basePath(d.kind)}/${r.id}/edit?saved=1`);
}

export async function updateRelease(id: string, fd: FormData) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const existing = await getOwned(v.account.id, id);
  const d = fromForm(fd);
  d.kind = existing.kind as Kind;
  const { data, tagIds, assetIds } = await toPatch(v.account.id, v.account.timezone, d, id);
  await db.release.update({ where: { id }, data: { ...data, updatedById: v.user.id, tags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) }, attachments: { deleteMany: {}, create: assetIds.map((assetId) => ({ assetId })) } } });
  await writeVersion(id, v.user.id);
  await audit(v.account.id, v.user.id, "release.update", "release", id);
  if (d.intent === "publish") { await publishRelease(id); return; }
  revalidatePath(`${basePath(existing.kind as Kind)}/${id}`);
  redirect(`${basePath(existing.kind as Kind)}/${id}/edit?saved=1`);
}

/** Called from the editor every few seconds while dirty. Never creates a version. Creates the draft on first call. */
export async function autosaveRelease(id: string | null, fd: FormData): Promise<{ id: string; savedAt: string; slug: string }> {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const d = fromForm(fd);
  if (id) {
    const existing = await getOwned(v.account.id, id);
    d.kind = existing.kind as Kind;
    const { data, tagIds, assetIds } = await toPatch(v.account.id, v.account.timezone, d, id);
    const r = await db.release.update({ where: { id }, data: { ...data, updatedById: v.user.id, tags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) }, attachments: { deleteMany: {}, create: assetIds.map((assetId) => ({ assetId })) } } });
    return { id: r.id, savedAt: r.updatedAt.toISOString(), slug: r.slug };
  }
  const { data, tagIds, assetIds } = await toPatch(v.account.id, v.account.timezone, d);
  const r = await db.release.create({ data: { ...data, accountId: v.account.id, createdById: v.user.id, updatedById: v.user.id, tags: { create: tagIds.map((tagId) => ({ tagId })) }, attachments: { create: assetIds.map((assetId) => ({ assetId })) } } });
  await audit(v.account.id, v.user.id, "release.create", "release", r.id, { kind: d.kind, autosave: true });
  return { id: r.id, savedAt: r.updatedAt.toISOString(), slug: r.slug };
}

// ------------------------------------------------------------ versions

export async function saveVersion(id: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const r = await getOwned(v.account.id, id);
  const ver = await writeVersion(id, v.user.id);
  await audit(v.account.id, v.user.id, "release.version", "release", id, { version: ver.version });
  revalidatePath(`${basePath(r.kind as Kind)}/${id}/versions`);
}

export async function restoreVersion(id: string, versionId: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const r = await getOwned(v.account.id, id);
  const ver = await db.releaseVersion.findFirst({ where: { id: versionId, releaseId: id } });
  if (!ver) throw new Error("Version not found");
  const s = ver.snapshot as any;
  const slug = s.slug ? await uniqueSlug(v.account.id, s.slug, id) : r.slug;
  const tagIds = await ownedIds(v.account.id, "tag", s.tagIds ?? []);
  const assetIds = await ownedIds(v.account.id, "asset", s.assetIds ?? []);
  await db.release.update({ where: { id }, data: {
    headline: s.headline ?? r.headline, subheadline: s.subheadline ?? null, datelineCity: s.datelineCity ?? null, datelineDate: s.datelineDate ? new Date(s.datelineDate) : null,
    body: cleanHtml(s.body ?? ""), blocks: s.blocks ?? null, boilerplateId: s.boilerplateId ?? null, footerId: s.footerId ?? null, featuredImageUrl: s.featuredImageUrl ?? null,
    embargoUntil: s.embargoUntil ? new Date(s.embargoUntil) : null, slug, clientId: s.clientId ?? null, proactivity: s.proactivity ?? r.proactivity, updatedById: v.user.id,
    tags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) }, attachments: { deleteMany: {}, create: assetIds.map((assetId) => ({ assetId })) },
  } });
  await writeVersion(id, v.user.id);
  await audit(v.account.id, v.user.id, "release.restore_version", "release", id, { version: ver.version });
  redirect(`${basePath(r.kind as Kind)}/${id}/edit?restored=${ver.version}`);
}

// ------------------------------------------------------------ lifecycle

export async function duplicateRelease(id: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const r = await getOwned(v.account.id, id);
  const slug = await uniqueSlug(v.account.id, `${r.headline} copy`);
  const copy = await db.release.create({ data: {
    accountId: v.account.id, kind: r.kind, status: "DRAFT", proactivity: r.proactivity, clientId: r.clientId, headline: `${r.headline} (copy)`, subheadline: r.subheadline,
    datelineCity: r.datelineCity, datelineDate: r.datelineDate, body: r.body, blocks: r.blocks ?? undefined, boilerplateId: r.boilerplateId, footerId: r.footerId, featuredImageUrl: r.featuredImageUrl,
    embargoUntil: r.embargoUntil, slug, createdById: v.user.id, updatedById: v.user.id,
    tags: { create: r.tags.map((t: any) => ({ tagId: t.tagId })) }, attachments: { create: r.attachments.map((a: any) => ({ assetId: a.assetId })) },
  } });
  await writeVersion(copy.id, v.user.id);
  await audit(v.account.id, v.user.id, "release.duplicate", "release", copy.id, { from: id });
  redirect(`${basePath(r.kind as Kind)}/${copy.id}/edit`);
}

export async function archiveRelease(id: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const r = await getOwned(v.account.id, id);
  await db.release.updateMany({ where: { id, accountId: v.account.id }, data: { status: "ARCHIVED", updatedById: v.user.id } });
  await audit(v.account.id, v.user.id, "release.archive", "release", id);
  revalidatePath(basePath(r.kind as Kind));
  revalidatePath(`${basePath(r.kind as Kind)}/${id}`);
}

export async function deleteRelease(id: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const r = await getOwned(v.account.id, id);
  await db.release.updateMany({ where: { id, accountId: v.account.id }, data: { deletedAt: new Date(), updatedById: v.user.id } });
  await audit(v.account.id, v.user.id, "release.delete", "release", id);
  redirect(basePath(r.kind as Kind));
}

export async function publishRelease(id: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const r = await getOwned(v.account.id, id);
  await db.release.updateMany({ where: { id, accountId: v.account.id }, data: { status: "LIVE", publishedAt: r.publishedAt ?? new Date(), updatedById: v.user.id } });
  await writeVersion(id, v.user.id);
  await audit(v.account.id, v.user.id, "release.publish", "release", id);
  const hooks = await db.webhookEndpoint.findMany({ where: { accountId: v.account.id, active: true, events: { has: "release.published" } }, select: { id: true } });
  if (hooks.length) await db.webhookDelivery.createMany({ data: hooks.map((h: any) => ({ endpointId: h.id, event: "release.published", payload: { releaseId: id, headline: r.headline, url: newsroomUrl(v.account.slug, r.slug) }, nextRetryAt: new Date() })) });
  revalidatePath(basePath(r.kind as Kind));
  redirect(`${basePath(r.kind as Kind)}/${id}`);
}

export async function setProactivity(id: string, proactivity: "PROACTIVE" | "REACTIVE" | "UNSET") {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  await db.release.updateMany({ where: { id, accountId: v.account.id }, data: { proactivity, updatedById: v.user.id } });
  await audit(v.account.id, v.user.id, "release.proactivity", "release", id, { proactivity });
}

// ------------------------------------------------------------ editor helpers

/** Render the editor's current form state for the preview iframe without saving. */
export async function renderPreview(fd: FormData): Promise<{ email: string; newsroom: string }> {
  const v = await requireViewer();
  const d = fromForm(fd);
  const fake = {
    kind: d.kind, headline: d.headline || "Untitled", subheadline: d.subheadline, datelineCity: d.datelineCity, datelineDate: d.datelineDate ? new Date(d.datelineDate) : null, body: d.body,
    blocks: d.kind === "NEWSLETTER" ? parseBlocks(safeJson(d.blocks)) : d.mediaContactId ? { mediaContactId: d.mediaContactId } : null,
    boilerplateId: d.boilerplateId || null, footerId: d.footerId || null, featuredImageUrl: d.featuredImageUrl || null,
    attachments: (await db.asset.findMany({ where: { accountId: v.account.id, id: { in: d.assetIds } }, select: { id: true, name: true, storageKey: true, externalUrl: true, kind: true, publicToken: true } })).map((asset: any) => ({ asset })),
  };
  const input = await buildRenderInput(v.account.id, fake);
  const url = newsroomUrl(v.account.slug, d.slug || "preview");
  return {
    email: renderReleaseHtml(input, { mode: "email", accountName: v.account.name, unsubscribeUrl: "#", wrapper: { newsroomUrl: url } }),
    newsroom: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Inter,system-ui,sans-serif;margin:24px;color:#1C1F26;} img{max-width:100%;}</style></head><body>${renderReleaseHtml(input, { mode: "newsroom" })}</body></html>`,
  };
}

/** Featured image upload: returns where the browser should PUT the bytes and the URL to store afterwards. */
export async function presignFeaturedImage(fileName: string, contentType: string): Promise<{ target: { method: "PUT"; url: string; headers: Record<string, string> }; url: string; key: string }> {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  if (!/^image\//.test(contentType)) throw new Error("Only images can be used as the featured image");
  const key = newStorageKey(v.account.id, "releases", fileName);
  const target = await presignedPut(key, contentType);
  const url = await urlFor(key);
  await audit(v.account.id, v.user.id, "release.image_upload", "release", undefined, { key });
  return { target, url, key };
}

