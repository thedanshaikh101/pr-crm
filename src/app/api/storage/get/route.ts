import { getObject } from "@/lib/storage";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";

// Serves local-disk objects. Public when the key belongs to an asset with a public token or a
// media-kit asset; otherwise the viewer must belong to the owning account (first key segment).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const key = u.searchParams.get("key") ?? "";
  const accountId = key.split("/")[0];
  const [v, asset] = await Promise.all([getViewer(), db.asset.findFirst({ where: { storageKey: key }, select: { publicToken: true, inMediaKit: true, deletedAt: true } })]);
  const isPublic = !!asset && !asset.deletedAt && (u.searchParams.get("t") === asset.publicToken || asset.inMediaKit || key.includes("/public/"));
  if (!isPublic && v?.account.id !== accountId && !v?.user.isSuperAdmin) return new Response("Not found", { status: 404 });
  const obj = await getObject(key);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(obj.body), { headers: { "content-type": obj.contentType, "cache-control": isPublic ? "public, max-age=3600" : "private, max-age=60" } });
}
