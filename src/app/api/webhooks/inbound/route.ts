import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { normalizeInbound } from "@/lib/email/replies";
import { applyInboundReply } from "@/lib/email/applyReply";

export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const given = req.headers.get("x-inbound-secret") ?? "";
  return given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

/** Resend inbound (email.received) or the generic {from, subject, inReplyTo, references, text} shape. */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const msg = normalizeInbound(body);
  if (!msg) return NextResponse.json({ ignored: true });
  const recipientId = await applyInboundReply(msg);
  return NextResponse.json({ matched: !!recipientId, recipientId });
}
