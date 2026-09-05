import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Tracked link redirect. Counts the click, then 302s to the target. */
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const link = await db.trackedLink.findUnique({ where: { code: params.code } });
  if (!link) return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Link not found</title></head><body style="font-family:system-ui;padding:40px;color:#1C1F26"><h1>Link not found</h1><p>This tracking link is unknown or has been removed.</p></body></html>`, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  const now = new Date();
  try {
    const ops: any[] = [db.trackedLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } })];
    if (link.recipientId) {
      const r = await db.distributionRecipient.findUnique({ where: { id: link.recipientId }, select: { firstOpenAt: true } });
      if (r) ops.push(
        db.distributionRecipient.update({ where: { id: link.recipientId }, data: { clickCount: { increment: 1 }, firstOpenAt: r.firstOpenAt ?? now } }),
        db.emailEvent.create({ data: { recipientId: link.recipientId, type: "CLICKED", url: link.targetUrl, createdAt: now } }),
      );
    }
    await db.$transaction(ops);
  } catch { /* still redirect */ }
  return Response.redirect(link.targetUrl, 302);
}
