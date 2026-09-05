import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Private download for signed-in members of the owning account. */
export async function GET(_req: Request, { params }: { params: { assetId: string } }) {
  const v = await getViewer();
  if (!v) return new Response("Unauthorized", { status: 401 });
  const a = await db.asset.findFirst({ where: { id: params.assetId, accountId: v.account.id }, select: { name: true, mime: true, storageKey: true, externalUrl: true } });
  if (!a) return new Response("Not found", { status: 404 });
  if (a.externalUrl) return Response.redirect(a.externalUrl, 302);
  if (!a.storageKey) return new Response("Not found", { status: 404 });
  const obj = await getObject(a.storageKey);
  if (!obj) return new Response("Not found", { status: 404 });
  const ascii = a.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return new Response(new Uint8Array(obj.body), { headers: { "content-type": a.mime || obj.contentType, "content-length": String(obj.body.length), "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.name)}`, "cache-control": "private, max-age=0" } });
}
