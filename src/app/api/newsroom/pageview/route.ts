import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const BOT = /bot|crawler|spider|preview|facebookexternalhit|slurp|headless|lighthouse/i;
const Body = z.object({ releaseId: z.string().min(1).max(64), referrer: z.string().max(2000).nullish() });

/** Records one pageview per browser per release per hour. Bots and repeat views (cookie) are skipped. */
export async function POST(req: Request) {
  const ua = req.headers.get("user-agent") ?? "";
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const { releaseId } = parsed.data;
  const cookieName = `pv_${releaseId}`;
  const seen = (req.headers.get("cookie") ?? "").split(/;\s*/).some((c) => c.startsWith(`${cookieName}=`));
  if (BOT.test(ua) || seen) return NextResponse.json({ ok: true, counted: false });
  const release = await db.release.findFirst({ where: { id: releaseId, status: "LIVE", deletedAt: null, OR: [{ embargoUntil: null }, { embargoUntil: { lte: new Date() } }] }, select: { id: true } });
  if (!release) return NextResponse.json({ ok: false }, { status: 404 });
  const referrer = parsed.data.referrer || req.headers.get("referer") || null;
  await db.$transaction([
    db.newsroomPageview.create({ data: { releaseId, referrer: referrer?.slice(0, 2000) ?? null, ua: ua.slice(0, 500) || null } }),
    db.release.update({ where: { id: releaseId }, data: { pageviews: { increment: 1 } } }),
  ]);
  const res = NextResponse.json({ ok: true, counted: true });
  res.cookies.set(cookieName, "1", { maxAge: 3600, path: "/", sameSite: "lax", httpOnly: true });
  return res;
}
