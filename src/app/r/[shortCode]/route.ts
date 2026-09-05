import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canonicalReleaseUrl, envFromProcess } from "@/lib/newsroom/urls";

export const dynamic = "force-dynamic";

/** Short link: /r/<shortCode> -> canonical newsroom URL of a LIVE, public release. */
export async function GET(_req: Request, { params }: { params: { shortCode: string } }) {
  const r = await db.release.findFirst({
    where: { shortCode: params.shortCode, status: "LIVE", deletedAt: null, OR: [{ embargoUntil: null }, { embargoUntil: { lte: new Date() } }] },
    select: { slug: true, account: { select: { slug: true, suspendedAt: true, newsroom: { select: { customDomain: true, domainVerifiedAt: true } } } } },
  });
  if (!r || r.account.suspendedAt) return new Response("Not found", { status: 404 });
  return NextResponse.redirect(canonicalReleaseUrl(r.account, r.account.newsroom, r, envFromProcess()), 302);
}
