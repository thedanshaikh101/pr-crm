import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiHttpError, readJson, withApiKey } from "@/lib/api/handler";
import { ContactPatchBody } from "@/lib/api/schemas";
import { contactOut } from "@/lib/api/serialize";
import { ensureOrg, searchTextOf, setTags } from "@/lib/api/contactsShared";

const INCLUDE = { organization: { select: { name: true } }, tags: { include: { tag: { select: { name: true } } } } } as const;

async function load(accountId: string, id: string) {
  const c = await db.contact.findFirst({ where: { id, accountId, deletedAt: null }, include: INCLUDE });
  if (!c) throw new ApiHttpError(404, "contact not found");
  return c;
}

// GET /api/v1/contacts/{id}
export const GET = withApiKey(async ({ account, params }) => NextResponse.json(contactOut(await load(account.id, params.id))));

// PATCH /api/v1/contacts/{id}
export const PATCH = withApiKey(async ({ req, account, params }) => {
  const existing = await load(account.id, params.id);
  const body = ContactPatchBody.parse(await readJson(req));
  const patch: any = {};
  for (const k of ["firstName", "lastName", "email", "jobTitle", "mobile", "landline"] as const) if (body[k] !== undefined) patch[k] = body[k];
  if (body.outlet !== undefined) patch.organizationId = await ensureOrg(account.id, body.outlet);
  const outletName = body.outlet !== undefined ? body.outlet : existing.organization?.name;
  const outletChanged = body.outlet !== undefined && (existing.organization?.name ?? "") !== (body.outlet ?? "");
  const titleChanged = body.jobTitle !== undefined && (existing.jobTitle ?? "") !== (body.jobTitle ?? "");
  if (outletChanged || titleChanged) {
    patch.significantUpdate = [outletChanged ? `Outlet: ${existing.organization?.name ?? "none"} -> ${body.outlet || "none"}` : null, titleChanged ? `Title: ${existing.jobTitle ?? "none"} -> ${body.jobTitle || "none"}` : null].filter(Boolean).join("; ");
    patch.significantUpdateAt = new Date();
  }
  patch.searchText = searchTextOf({ ...existing, ...patch }, outletName);
  await db.contact.updateMany({ where: { id: existing.id, accountId: account.id }, data: patch });
  if (body.tags) await setTags(account.id, existing.id, body.tags);
  await audit(account.id, null, "contact.update", "contact", existing.id, { via: "api", fields: Object.keys(body) });
  return NextResponse.json(contactOut(await load(account.id, existing.id)));
});

// DELETE /api/v1/contacts/{id}  (soft delete)
export const DELETE = withApiKey(async ({ account, params }) => {
  const r = await db.contact.updateMany({ where: { id: params.id, accountId: account.id, deletedAt: null }, data: { deletedAt: new Date() } });
  if (!r.count) throw new ApiHttpError(404, "contact not found");
  await audit(account.id, null, "contact.delete", "contact", params.id, { via: "api" });
  return NextResponse.json({ ok: true });
});
