// Server-side read helpers shared by the Response Desk pages (db access; not unit-tested).
import { db } from "@/lib/db";
import { urlFor } from "@/lib/storage";
import { DEFAULT_CASE_TYPES, DEFAULT_TOPIC_TYPES } from "./labels";

export async function teammates(accountId: string) {
  const rows = await db.membership.findMany({ where: { accountId, deactivatedAt: null }, include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } });
  return rows.map((m: any) => ({ id: m.user.id as string, name: m.user.name as string, role: m.role as string }));
}

export function nameOf(team: { id: string; name: string }[]) {
  return (id: string | null | undefined) => (id ? team.find((t) => t.id === id)?.name ?? "Former member" : null);
}

/** PickListItem names of a kind, falling back to defaults when the account has none. */
export async function pickList(accountId: string, kind: "case_type" | "topic_type") {
  const rows = await db.pickListItem.findMany({ where: { accountId, kind }, orderBy: { name: "asc" }, select: { name: true } });
  const names = rows.map((r: any) => r.name as string);
  return names.length ? names : kind === "case_type" ? DEFAULT_CASE_TYPES : DEFAULT_TOPIC_TYPES;
}

export async function topicOptions(accountId: string) {
  return db.topic.findMany({ where: { accountId }, orderBy: [{ status: "asc" }, { name: "asc" }], select: { id: true, name: true, status: true } });
}

export async function assetOptions(accountId: string) {
  return db.asset.findMany({ where: { accountId, deletedAt: null }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true, kind: true } });
}

/** Attachment rows for one entity with a resolved link per asset. */
export async function attachmentsFor(accountId: string, entity: string, entityId: string) {
  const rows = await db.attachment.findMany({ where: { accountId, entity, entityId }, include: { asset: true }, orderBy: { createdAt: "desc" } });
  return Promise.all(rows.map(async (a: any) => ({ id: a.id as string, createdAt: a.createdAt as Date, asset: { id: a.asset.id, name: a.asset.name, kind: a.asset.kind, size: a.asset.size, deleted: !!a.asset.deletedAt }, href: await assetHref(a.asset) })));
}

export async function assetHref(asset: { storageKey: string | null; externalUrl: string | null }) {
  if (asset.externalUrl) return asset.externalUrl;
  if (asset.storageKey) { try { return await urlFor(asset.storageKey); } catch { return null; } }
  return null;
}
