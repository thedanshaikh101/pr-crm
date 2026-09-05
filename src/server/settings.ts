"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireRole, requireViewer } from "@/lib/auth";
import { cleanHtml } from "@/lib/html";
import { newStorageKey, presignedPut, urlFor } from "@/lib/storage";
import { apiKeyPrefix, generateApiKey, generateWebhookSecret, hashApiKey } from "@/lib/settings/keys";
import { normalizeColor, planTagMerge } from "@/lib/settings/tags";
import { PICKLIST_KINDS } from "@/lib/settings/defaults";
import { enqueueDelivery, WEBHOOK_EVENTS } from "@/lib/settings/webhooks";
import { DELETED_TYPES, type DeletedType } from "@/lib/settings/retention";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// ------------------------------------------------------------ clients

const ClientInput = z.object({ name: z.string().min(1).max(120), color: z.string().optional(), logoUrl: z.string().optional(), defaultBoilerplateId: z.string().optional() });

export async function createClient(fd: FormData) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const d = ClientInput.parse(Object.fromEntries(fd));
  const c = await db.client.create({ data: { accountId: v.account.id, name: d.name, color: normalizeColor(d.color), logoUrl: d.logoUrl || null, defaultBoilerplateId: d.defaultBoilerplateId || null } });
  await audit(v.account.id, v.user.id, "client.create", "client", c.id, { name: d.name });
  revalidatePath("/settings/clients");
  redirect("/settings/clients");
}

export async function updateClient(id: string, fd: FormData) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const d = ClientInput.parse(Object.fromEntries(fd));
  await db.client.updateMany({ where: { id, accountId: v.account.id }, data: { name: d.name, color: normalizeColor(d.color), logoUrl: d.logoUrl || null, defaultBoilerplateId: d.defaultBoilerplateId || null } });
  await audit(v.account.id, v.user.id, "client.update", "client", id, { name: d.name });
  revalidatePath("/settings/clients");
  redirect("/settings/clients");
}

export async function deleteClient(id: string) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const [releases, coverage] = await Promise.all([db.release.count({ where: { clientId: id, accountId: v.account.id } }), db.coverage.count({ where: { clientId: id, accountId: v.account.id } })]);
  if (releases || coverage) throw new Error("This client is still referenced by releases or coverage");
  await db.calendarEvent.updateMany({ where: { clientId: id, accountId: v.account.id }, data: { clientId: null } });
  await db.boilerplate.updateMany({ where: { clientId: id, accountId: v.account.id }, data: { clientId: null } });
  await db.client.deleteMany({ where: { id, accountId: v.account.id } });
  await audit(v.account.id, v.user.id, "client.delete", "client", id);
  revalidatePath("/settings/clients");
}

/** Browser uploads the logo straight to storage; returns where to PUT and the URL to store afterwards. */
export async function presignClientLogo(fileName: string, contentType: string) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  if (!/^image\//.test(contentType)) throw new Error("Logos must be images");
  const key = newStorageKey(v.account.id, "clients", fileName || "logo.png");
  const target = await presignedPut(key, contentType);
  return { target, key, url: await urlFor(key) };
}

// ------------------------------------------------------------ tag groups and tags

export async function createTagGroup(fd: FormData) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const name = str(fd, "name"); if (!name) return;
  const g = await db.tagGroup.upsert({ where: { accountId_name: { accountId: v.account.id, name } }, create: { accountId: v.account.id, name }, update: {} });
  await audit(v.account.id, v.user.id, "tag_group.create", "tag_group", g.id, { name });
  revalidatePath("/settings/tags");
}

export async function renameTagGroup(id: string, fd: FormData) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const name = str(fd, "name"); if (!name) return;
  await db.tagGroup.updateMany({ where: { id, accountId: v.account.id }, data: { name } });
  await audit(v.account.id, v.user.id, "tag_group.rename", "tag_group", id, { name });
  revalidatePath("/settings/tags");
}

export async function deleteTagGroup(id: string) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  await db.tag.updateMany({ where: { groupId: id, accountId: v.account.id }, data: { groupId: null } });
  await db.tagGroup.deleteMany({ where: { id, accountId: v.account.id } });
  await audit(v.account.id, v.user.id, "tag_group.delete", "tag_group", id);
  revalidatePath("/settings/tags");
}

async function ownedGroup(accountId: string, groupId: string) {
  if (!groupId) return null;
  const g = await db.tagGroup.findFirst({ where: { id: groupId, accountId }, select: { id: true } });
  return g?.id ?? null;
}

export async function createTag(fd: FormData) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const name = str(fd, "name"); if (!name) return;
  const groupId = await ownedGroup(v.account.id, str(fd, "groupId"));
  const t = await db.tag.upsert({ where: { accountId_name: { accountId: v.account.id, name } }, create: { accountId: v.account.id, name, color: normalizeColor(str(fd, "color")), groupId }, update: {} });
  await audit(v.account.id, v.user.id, "tag.create", "tag", t.id, { name });
  revalidatePath("/settings/tags");
}

export async function updateTag(id: string, fd: FormData) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const name = str(fd, "name"); if (!name) return;
  const groupId = await ownedGroup(v.account.id, str(fd, "groupId"));
  await db.tag.updateMany({ where: { id, accountId: v.account.id }, data: { name, color: normalizeColor(str(fd, "color")), groupId } });
  await audit(v.account.id, v.user.id, "tag.update", "tag", id, { name });
  revalidatePath("/settings/tags");
  redirect("/settings/tags");
}

export async function mergeTags(fromId: string, fd: FormData) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const intoId = str(fd, "intoId");
  const [from, into] = await Promise.all([
    db.tag.findFirst({ where: { id: fromId, accountId: v.account.id }, include: { _count: { select: { contacts: true, releases: true, coverage: true } } } }),
    db.tag.findFirst({ where: { id: intoId, accountId: v.account.id }, select: { id: true, name: true } }),
  ]);
  if (!from || !into) throw new Error("Tag not found");
  const plan = planTagMerge(from.id, into.id, from._count);
  const ops: any[] = [];
  for (const j of plan.joins) {
    const rows = await (db as any)[j.table].findMany({ where: { tagId: plan.fromId }, select: { [j.key]: true } });
    ops.push((db as any)[j.table].createMany({ data: rows.map((r: any) => ({ [j.key]: r[j.key], tagId: plan.intoId })), skipDuplicates: true }));
  }
  ops.push(db.tag.delete({ where: { id: plan.fromId } }));
  await db.$transaction(ops);
  await audit(v.account.id, v.user.id, "tag.merge", "tag", into.id, { from: from.name, into: into.name, maxMoved: plan.maxMoved });
  revalidatePath("/settings/tags");
  redirect("/settings/tags");
}

export async function deleteTag(id: string) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  await db.tag.deleteMany({ where: { id, accountId: v.account.id } });
  await audit(v.account.id, v.user.id, "tag.delete", "tag", id);
  revalidatePath("/settings/tags");
  redirect("/settings/tags");
}

// ------------------------------------------------------------ pick lists

const Kind = z.enum(PICKLIST_KINDS);

export async function addPickListItem(kind: string, fd: FormData) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const k = Kind.parse(kind); const name = str(fd, "name"); if (!name) return;
  await db.pickListItem.upsert({ where: { accountId_kind_name: { accountId: v.account.id, kind: k, name } }, create: { accountId: v.account.id, kind: k, name }, update: {} });
  await audit(v.account.id, v.user.id, "picklist.add", "picklist", undefined, { kind: k, name });
  revalidatePath("/settings/pick-lists");
}

export async function renamePickListItem(id: string, fd: FormData) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const name = str(fd, "name"); if (!name) return;
  await db.pickListItem.updateMany({ where: { id, accountId: v.account.id }, data: { name } });
  await audit(v.account.id, v.user.id, "picklist.rename", "picklist", id, { name });
  revalidatePath("/settings/pick-lists");
}

export async function deletePickListItem(id: string) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  await db.pickListItem.deleteMany({ where: { id, accountId: v.account.id } });
  await audit(v.account.id, v.user.id, "picklist.delete", "picklist", id);
  revalidatePath("/settings/pick-lists");
}

// ------------------------------------------------------------ classifications

export async function addClassification(fd: FormData) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const name = str(fd, "name"); if (!name) return;
  const exists = await db.classification.findFirst({ where: { name, OR: [{ accountId: v.account.id }, { accountId: null }] } });
  if (!exists) await db.classification.create({ data: { accountId: v.account.id, name } });
  await audit(v.account.id, v.user.id, "classification.add", "classification", undefined, { name });
  revalidatePath("/settings/classifications");
}

export async function renameClassification(id: string, fd: FormData) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const name = str(fd, "name"); if (!name) return;
  await db.classification.updateMany({ where: { id, accountId: v.account.id }, data: { name } });
  await audit(v.account.id, v.user.id, "classification.rename", "classification", id, { name });
  revalidatePath("/settings/classifications");
}

export async function deleteClassification(id: string) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  await db.classification.deleteMany({ where: { id, accountId: v.account.id } });
  await audit(v.account.id, v.user.id, "classification.delete", "classification", id);
  revalidatePath("/settings/classifications");
}

// ------------------------------------------------------------ boilerplates

const BoilerplateInput = z.object({ name: z.string().min(1).max(160), kind: z.enum(["BOILERPLATE", "FOOTER", "MEDIA_CONTACT"]), clientId: z.string().optional(), body: z.string().default(""), isDefault: z.string().optional() });

export async function saveBoilerplate(id: string | null, fd: FormData) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const d = BoilerplateInput.parse(Object.fromEntries(fd));
  const clientId = d.clientId ? (await db.client.findFirst({ where: { id: d.clientId, accountId: v.account.id }, select: { id: true } }))?.id ?? null : null;
  const isDefault = d.isDefault === "on";
  const data = { name: d.name, kind: d.kind, clientId, body: cleanHtml(d.body), isDefault };
  let bid = id;
  if (id) {
    const owned = await db.boilerplate.findFirst({ where: { id, accountId: v.account.id }, select: { id: true } });
    if (!owned) throw new Error("Not found");
    await db.boilerplate.update({ where: { id }, data });
  } else {
    bid = (await db.boilerplate.create({ data: { accountId: v.account.id, ...data } })).id;
  }
  if (isDefault) await db.boilerplate.updateMany({ where: { accountId: v.account.id, kind: d.kind, clientId, NOT: { id: bid! } }, data: { isDefault: false } });
  await audit(v.account.id, v.user.id, id ? "boilerplate.update" : "boilerplate.create", "boilerplate", bid!, { name: d.name, kind: d.kind });
  revalidatePath("/settings/boilerplates");
  redirect(`/settings/boilerplates?preview=${bid}`);
}

export async function deleteBoilerplate(id: string) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const owned = await db.boilerplate.findFirst({ where: { id, accountId: v.account.id }, select: { id: true } });
  if (!owned) return;
  await db.$transaction([
    db.release.updateMany({ where: { accountId: v.account.id, boilerplateId: id }, data: { boilerplateId: null } }),
    db.release.updateMany({ where: { accountId: v.account.id, footerId: id }, data: { footerId: null } }),
    db.client.updateMany({ where: { accountId: v.account.id, defaultBoilerplateId: id }, data: { defaultBoilerplateId: null } }),
    db.boilerplate.delete({ where: { id } }),
  ]);
  await audit(v.account.id, v.user.id, "boilerplate.delete", "boilerplate", id);
  revalidatePath("/settings/boilerplates");
  redirect("/settings/boilerplates");
}

// ------------------------------------------------------------ API keys

export async function createApiKey(_: unknown, fd: FormData): Promise<{ key?: string; error?: string }> {
  const v = await requireViewer(); requireRole(v, "ADMIN");
  const name = str(fd, "name") || "Default";
  const plaintext = generateApiKey();
  const k = await db.apiKey.create({ data: { accountId: v.account.id, name, keyHash: hashApiKey(plaintext), prefix: apiKeyPrefix(plaintext) } });
  await audit(v.account.id, v.user.id, "api_key.create", "api_key", k.id, { name, prefix: k.prefix });
  revalidatePath("/settings/api");
  return { key: plaintext };
}

export async function revokeApiKey(id: string) {
  const v = await requireViewer(); requireRole(v, "ADMIN");
  await db.apiKey.updateMany({ where: { id, accountId: v.account.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(v.account.id, v.user.id, "api_key.revoke", "api_key", id);
  revalidatePath("/settings/api");
}

// ------------------------------------------------------------ webhooks

const EndpointInput = z.object({ url: z.string().url().refine((u) => u.startsWith("https://"), "Webhook URLs must use https"), events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Pick at least one event") });

function parseEndpoint(fd: FormData) {
  return EndpointInput.safeParse({ url: str(fd, "url"), events: fd.getAll("events").map(String) });
}

export async function createWebhookEndpoint(_: unknown, fd: FormData): Promise<{ secret?: string; error?: string }> {
  const v = await requireViewer(); requireRole(v, "ADMIN");
  const p = parseEndpoint(fd);
  if (!p.success) return { error: p.error.issues[0].message };
  const secret = generateWebhookSecret();
  const ep = await db.webhookEndpoint.create({ data: { accountId: v.account.id, url: p.data.url, events: p.data.events, secret } });
  await audit(v.account.id, v.user.id, "webhook.create", "webhook", ep.id, { url: p.data.url, events: p.data.events });
  revalidatePath("/settings/api");
  return { secret };
}

export async function updateWebhookEndpoint(id: string, fd: FormData) {
  const v = await requireViewer(); requireRole(v, "ADMIN");
  const p = parseEndpoint(fd);
  if (!p.success) throw new Error(p.error.issues[0].message);
  await db.webhookEndpoint.updateMany({ where: { id, accountId: v.account.id }, data: { url: p.data.url, events: p.data.events } });
  await audit(v.account.id, v.user.id, "webhook.update", "webhook", id, { url: p.data.url, events: p.data.events });
  revalidatePath("/settings/api");
  redirect(`/settings/api?endpoint=${id}`);
}

export async function toggleWebhookEndpoint(id: string, active: boolean) {
  const v = await requireViewer(); requireRole(v, "ADMIN");
  await db.webhookEndpoint.updateMany({ where: { id, accountId: v.account.id }, data: { active } });
  await audit(v.account.id, v.user.id, active ? "webhook.enable" : "webhook.disable", "webhook", id);
  revalidatePath("/settings/api");
}

export async function deleteWebhookEndpoint(id: string) {
  const v = await requireViewer(); requireRole(v, "ADMIN");
  await db.webhookEndpoint.deleteMany({ where: { id, accountId: v.account.id } });
  await audit(v.account.id, v.user.id, "webhook.delete", "webhook", id);
  revalidatePath("/settings/api");
  redirect("/settings/api");
}

export async function sendTestWebhook(id: string) {
  const v = await requireViewer(); requireRole(v, "ADMIN");
  const ep = await db.webhookEndpoint.findFirst({ where: { id, accountId: v.account.id }, select: { id: true } });
  if (!ep) throw new Error("Endpoint not found");
  const d = await db.webhookDelivery.create({ data: { endpointId: ep.id, event: "test", payload: { message: "Test delivery from Pressdesk", account: v.account.slug, sentBy: v.user.email }, nextRetryAt: new Date() } });
  await enqueueDelivery(d.id, 0);
  await audit(v.account.id, v.user.id, "webhook.test", "webhook", id, { deliveryId: d.id });
  revalidatePath("/settings/api");
  redirect(`/settings/api?endpoint=${id}`);
}

// ------------------------------------------------------------ deleted items

const MODEL: Record<DeletedType, string> = { contacts: "contact", organizations: "organization", lists: "list", releases: "release", coverage: "coverage", assets: "asset" };

function deletedType(t: string): DeletedType {
  if (!(DELETED_TYPES as readonly string[]).includes(t)) throw new Error("Unknown type");
  return t as DeletedType;
}

export async function restoreDeleted(type: string, ids: string[]) {
  const v = await requireViewer(); requireRole(v, "EDITOR");
  const t = deletedType(type);
  if (!ids.length) return;
  const model = (db as any)[MODEL[t]];
  if (t === "contacts") {
    const rows = await db.contact.findMany({ where: { id: { in: ids }, accountId: v.account.id, deletedAt: { not: null } }, select: { id: true, mergedIntoId: true } });
    const targets = rows.map((r: any) => r.mergedIntoId).filter(Boolean) as string[];
    const alive = targets.length ? new Set((await db.contact.findMany({ where: { id: { in: targets }, deletedAt: null }, select: { id: true } })).map((c: any) => c.id)) : new Set<string>();
    for (const r of rows) await db.contact.update({ where: { id: r.id }, data: { deletedAt: null, mergedIntoId: r.mergedIntoId && alive.has(r.mergedIntoId) ? r.mergedIntoId : null } });
  } else {
    await model.updateMany({ where: { id: { in: ids }, accountId: v.account.id }, data: { deletedAt: null } });
  }
  await audit(v.account.id, v.user.id, `${MODEL[t]}.restore`, MODEL[t], undefined, { ids });
  revalidatePath(`/settings/deleted`);
}

export async function purgeDeleted(type: string, ids: string[]) {
  const v = await requireViewer(); requireRole(v, "ADMIN");
  const t = deletedType(type);
  if (!ids.length) return;
  const where = { id: { in: ids }, accountId: v.account.id, deletedAt: { not: null } };
  if (t === "contacts") {
    await db.$transaction([
      db.coverage.updateMany({ where: { accountId: v.account.id, contactId: { in: ids } }, data: { contactId: null } }),
      db.conversation.updateMany({ where: { accountId: v.account.id, contactId: { in: ids } }, data: { contactId: null } }),
      db.interviewRequest.updateMany({ where: { accountId: v.account.id, contactId: { in: ids } }, data: { contactId: null } }),
      db.distributionRecipient.updateMany({ where: { contactId: { in: ids } }, data: { contactId: null } }),
      db.contact.deleteMany({ where }),
    ]);
  } else if (t === "organizations") {
    await db.$transaction([
      db.contact.updateMany({ where: { accountId: v.account.id, organizationId: { in: ids } }, data: { organizationId: null } }),
      db.coverage.updateMany({ where: { accountId: v.account.id, organizationId: { in: ids } }, data: { organizationId: null } }),
      db.organization.deleteMany({ where }),
    ]);
  } else if (t === "lists") {
    await db.$transaction([db.distribution.updateMany({ where: { accountId: v.account.id, listId: { in: ids } }, data: { listId: null } }), db.list.deleteMany({ where })]);
  } else if (t === "releases") {
    await db.$transaction([db.coverage.updateMany({ where: { accountId: v.account.id, releaseId: { in: ids } }, data: { releaseId: null } }), db.release.deleteMany({ where })]);
  } else if (t === "coverage") {
    await db.coverage.deleteMany({ where });
  } else if (t === "assets") {
    const rows = await db.asset.findMany({ where, select: { id: true, storageKey: true } });
    const { deleteObject } = await import("@/lib/storage");
    for (const r of rows) if (r.storageKey) await deleteObject(r.storageKey).catch(() => {});
    await db.asset.deleteMany({ where: { id: { in: rows.map((r: any) => r.id) } } });
  }
  await audit(v.account.id, v.user.id, `${MODEL[t]}.purge`, MODEL[t], undefined, { ids });
  revalidatePath(`/settings/deleted`);
}
