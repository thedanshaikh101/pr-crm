import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { applyEmailEvent, normalizeResendEvent } from "@/lib/email/events";

// Resend (Svix) signature check. Other providers: add a branch keyed on EMAIL_PROVIDER.
function verify(req: Request, raw: string) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const id = req.headers.get("svix-id"), ts = req.headers.get("svix-timestamp"), sig = req.headers.get("svix-signature");
  if (!id || !ts || !sig) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${raw}`).digest("base64");
  return sig.split(" ").some((s) => { const v = s.split(",")[1]; return v && v.length === expected.length && timingSafeEqual(Buffer.from(v), Buffer.from(expected)); });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verify(req, raw)) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  const e = normalizeResendEvent(JSON.parse(raw));
  if (!e) return NextResponse.json({ ignored: true });
  const ok = await applyEmailEvent(e);
  return NextResponse.json({ ok });
}
