import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { normalizeInboundEmail } from "@/lib/responseDesk/inbox";
import { applyInboundEmail } from "@/lib/responseDesk/inboxApply";

// Shared inbox receiver. POST /api/webhooks/inbox?account=<slug> with header x-inbox-secret: $INBOX_WEBHOOK_SECRET.
// Body: Resend inbound email JSON, or a generic { from, subject, text, html, messageId, receivedAt }.
// Inbound mail is per account, so the account slug travels in the query string (one forwarding rule per workspace).
function secretOk(req: Request) {
  const secret = process.env.INBOX_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const given = req.headers.get("x-inbox-secret") ?? "";
  return given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

export async function POST(req: Request) {
  if (!secretOk(req)) return NextResponse.json({ error: "bad secret" }, { status: 401 });
  const slug = new URL(req.url).searchParams.get("account")?.trim();
  if (!slug) return NextResponse.json({ error: "account query param required" }, { status: 400 });
  const account = await db.account.findUnique({ where: { slug }, select: { id: true, suspendedAt: true } });
  if (!account || account.suspendedAt) return NextResponse.json({ error: "unknown account" }, { status: 404 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const norm = normalizeInboundEmail(body);
  const r = await applyInboundEmail(db, account.id, norm);
  return NextResponse.json({ conversationId: r.conversationId, created: r.created, contactMatched: !!r.contactId });
}
