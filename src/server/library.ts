"use server";
// Resource Library server actions. Every query pins accountId; writes need EDITOR.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireRole, requireViewer } from "@/lib/auth";
import { newStorageKey, presignedPut, deleteObject } from "@/lib/storage";
import { ASSET_KINDS, MAX_UPLOAD_BYTES, isAllowedMime, isKind, kindFromMime, parseTags } from "@/lib/library/kinds";

const KindSchema = z.enum(ASSET_KINDS);
const Id = z.string().min(1).max(64);
const Ids = z.array(Id).min(1).max(500);

async function ownedFolder(accountId: string, folderId: string | null | undefined) {
  if (!folderId) return null;
  const f = await db.folder.findFirst({ where: { id: folderId, accountId }, select: { id: true } });
  return f?.id ?? null;
}

// ------------------------------------------------------------ uploads

const RequestUpload = z.object({ name: z.string().trim().min(1).max(200), mime: z.string().trim().min(1).max(120), size: z.number().int().nonnegative(), folderId: z.string().nullish(), kind: KindSchema.optional() });

/** Step 1 of a browser upload: validate, create the Asset row, hand back where to PUT the bytes. */
export async function requestUpload(input: z.infer<typeof RequestUpload>) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const p = RequestUpload.parse(input);
  if (p.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 50 MB");
  if (!isAllowedMime(p.mime)) throw new Error(p.mime.startsWith("video/") ? "Videos are not uploaded here. Add a video link instead." : `File type ${p.mime} is not allowed`);
  const kind = p.kind ?? kindFromMime(p.name, p.mime);
  const storageKey = newStorageKey(v.account.id, "assets", p.name);
  const asset = await db.asset.create({ data: { accountId: v.account.id, folderId: await ownedFolder(v.account.id, p.folderId), name: p.name, kind, storageKey, mime: p.mime, size: p.size } });
  const target = await presignedPut(storageKey, p.mime);
  await audit(v.account.id, v.user.id, "asset.upload_start", "asset", asset.id, { name: p.name, size: p.size });
  return { assetId: asset.id, target };
}

/** Step 2: the bytes are in storage; record image dimensions. */
export async function finalizeUpload(assetId: string, dims?: { width?: number | null; height?: number | null }) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const d = z.object({ width: z.number().int().positive().nullish(), height: z.number().int().positive().nullish() }).parse(dims ?? {});
  await db.asset.updateMany({ where: { id: Id.parse(assetId), accountId: v.account.id }, data: { width: d.width ?? undefined, height: d.height ?? undefined } });
  await audit(v.account.id, v.user.id, "asset.upload", "asset", assetId, d);
  revalidatePath("/library");
}

/** If the PUT failed, drop the placeholder row so the library does not show a broken file. */
export async function abandonUpload(assetId: string) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const a = await db.asset.findFirst({ where: { id: Id.parse(assetId), accountId: v.account.id, width: null, height: null } });
  if (!a) return;
  await db.asset.delete({ where: { id: a.id } });
  if (a.storageKey) await deleteObject(a.storageKey).catch(() => {});
  revalidatePath("/library");
}

export async function createVideoLink(form: FormData) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const p = z.object({ name: z.string().trim().min(1).max(200), externalUrl: z.string().trim().url().max(2000), folderId: z.string().nullish() }).parse({ name: form.get("name"), externalUrl: form.get("externalUrl"), folderId: form.get("folderId") || null });
  const a = await db.asset.create({ data: { accountId: v.account.id, folderId: await ownedFolder(v.account.id, p.folderId), name: p.name, kind: "video_link", externalUrl: p.externalUrl, tags: parseTags(String(form.get("tags") ?? "")) } });
  await audit(v.account.id, v.user.id, "asset.create", "asset", a.id, { kind: "video_link" });
  revalidatePath("/library");
}

// ------------------------------------------------------------ asset edits

export async function updateAsset(assetId: string, form: FormData) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const id = Id.parse(assetId);
  const data: Record<string, unknown> = {};
  if (form.has("name")) data.name = z.string().trim().min(1).max(200).parse(form.get("name"));
  if (form.has("kind")) { const k = String(form.get("kind")); if (!isKind(k)) throw new Error("Unknown kind"); data.kind = k; }
  if (form.has("folderId")) data.folderId = await ownedFolder(v.account.id, String(form.get("folderId") || "") || null);
  if (form.has("tags")) data.tags = parseTags(String(form.get("tags") ?? ""));
  if (form.has("inMediaKit")) data.inMediaKit = ["on", "true", "1"].includes(String(form.get("inMediaKit")));
  if (form.has("externalUrl")) data.externalUrl = z.string().trim().url().max(2000).parse(form.get("externalUrl"));
  if (!Object.keys(data).length) return;
  await db.asset.updateMany({ where: { id, accountId: v.account.id }, data });
  await audit(v.account.id, v.user.id, "asset.update", "asset", id, data);
  revalidatePath("/library");
}

export async function toggleMediaKit(assetId: string, inMediaKit: boolean) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  await db.asset.updateMany({ where: { id: Id.parse(assetId), accountId: v.account.id }, data: { inMediaKit: !!inMediaKit } });
  await audit(v.account.id, v.user.id, "asset.update", "asset", assetId, { inMediaKit });
  revalidatePath("/library");
}

export async function moveAssets(assetIds: string[], folderId: string | null) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const ids = Ids.parse(assetIds);
  const target = await ownedFolder(v.account.id, folderId);
  await db.asset.updateMany({ where: { id: { in: ids }, accountId: v.account.id }, data: { folderId: target } });
  await audit(v.account.id, v.user.id, "asset.move", "asset", undefined, { count: ids.length, folderId: target });
  revalidatePath("/library");
}

export async function tagAssets(assetIds: string[], tag: string) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const ids = Ids.parse(assetIds);
  const tags = parseTags(tag);
  if (!tags.length) return;
  const rows = await db.asset.findMany({ where: { id: { in: ids }, accountId: v.account.id }, select: { id: true, tags: true } });
  await db.$transaction(rows.map((r: any) => db.asset.update({ where: { id: r.id }, data: { tags: Array.from(new Set([...r.tags, ...tags])) } })));
  await audit(v.account.id, v.user.id, "asset.tag", "asset", undefined, { count: rows.length, tags });
  revalidatePath("/library");
}

export async function deleteAssets(assetIds: string[]) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const ids = Ids.parse(assetIds);
  await db.asset.updateMany({ where: { id: { in: ids }, accountId: v.account.id, deletedAt: null }, data: { deletedAt: new Date() } });
  await audit(v.account.id, v.user.id, "asset.delete", "asset", undefined, { count: ids.length, ids });
  revalidatePath("/library");
}

export async function restoreAssets(assetIds: string[]) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const ids = Ids.parse(assetIds);
  await db.asset.updateMany({ where: { id: { in: ids }, accountId: v.account.id }, data: { deletedAt: null } });
  await audit(v.account.id, v.user.id, "asset.restore", "asset", undefined, { count: ids.length, ids });
  revalidatePath("/library");
}

// ------------------------------------------------------------ folders

export async function createFolder(form: FormData) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const name = z.string().trim().min(1).max(80).parse(form.get("name"));
  const parentId = await ownedFolder(v.account.id, String(form.get("parentId") || "") || null);
  const f = await db.folder.create({ data: { accountId: v.account.id, name, parentId } });
  await audit(v.account.id, v.user.id, "folder.create", "folder", f.id, { name, parentId });
  revalidatePath("/library");
  redirect(`/library?folder=${f.id}`);
}

export async function renameFolder(folderId: string, form: FormData) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const name = z.string().trim().min(1).max(80).parse(form.get("name"));
  await db.folder.updateMany({ where: { id: Id.parse(folderId), accountId: v.account.id }, data: { name } });
  await audit(v.account.id, v.user.id, "folder.rename", "folder", folderId, { name });
  revalidatePath("/library");
}

/** Only empty folders (no files, no subfolders) can be deleted. */
export async function deleteFolder(folderId: string) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const id = Id.parse(folderId);
  const [files, children] = await Promise.all([
    db.asset.count({ where: { accountId: v.account.id, folderId: id } }),
    db.folder.count({ where: { accountId: v.account.id, parentId: id } }),
  ]);
  if (files || children) throw new Error("Move or delete the files and subfolders first");
  await db.folder.deleteMany({ where: { id, accountId: v.account.id } });
  await audit(v.account.id, v.user.id, "folder.delete", "folder", id);
  revalidatePath("/library");
  redirect("/library");
}
