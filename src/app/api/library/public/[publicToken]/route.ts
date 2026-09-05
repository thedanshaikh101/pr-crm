import { db } from "@/lib/db";
import { getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

function contentDisposition(kind: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Public asset link used by the newsroom and shared with journalists. Never lists; the token is the key. */
export async function GET(_req: Request, { params }: { params: { publicToken: string } }) {
  const a = await db.asset.findFirst({ where: { publicToken: params.publicToken, deletedAt: null }, select: { name: true, mime: true, storageKey: true, externalUrl: true, account: { select: { suspendedAt: true } } } });
  if (!a || a.account.suspendedAt) return new Response("Not found", { status: 404 });
  if (a.externalUrl) return Response.redirect(a.externalUrl, 302);
  if (!a.storageKey) return new Response("Not found", { status: 404 });
  const obj = await getObject(a.storageKey);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(obj.body), { headers: { "content-type": a.mime || obj.contentType, "content-length": String(obj.body.length), "content-disposition": contentDisposition("inline", a.name), "cache-control": "public, max-age=3600" } });
}
