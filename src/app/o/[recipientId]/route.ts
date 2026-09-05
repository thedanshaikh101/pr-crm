import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const HEADERS = { "content-type": "image/gif", "content-length": String(GIF.length), "cache-control": "no-store, no-cache, must-revalidate, max-age=0", pragma: "no-cache", expires: "0" };

/** Open pixel. Records the open and always returns a 1x1 GIF; unknown ids are ignored silently. */
export async function GET(_req: Request, { params }: { params: { recipientId: string } }) {
  const id = params.recipientId.replace(/\.gif$/i, "");
  try {
    const r = await db.distributionRecipient.findUnique({ where: { id }, select: { id: true, firstOpenAt: true } });
    if (r) {
      const now = new Date();
      await db.$transaction([
        db.distributionRecipient.update({ where: { id }, data: { firstOpenAt: r.firstOpenAt ?? now, openCount: { increment: 1 } } }),
        db.emailEvent.create({ data: { recipientId: id, type: "OPENED", createdAt: now } }),
      ]);
    }
  } catch { /* never break the image */ }
  return new Response(GIF, { status: 200, headers: HEADERS });
}
