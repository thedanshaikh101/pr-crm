import { NextResponse } from "next/server";
import { putObject, verifyKeySig } from "@/lib/storage";

// Local-disk upload target used when S3 is not configured. Signed by presignedPut().
export async function PUT(req: Request) {
  const u = new URL(req.url);
  const key = u.searchParams.get("key") ?? "";
  const exp = Number(u.searchParams.get("exp") ?? 0);
  const sig = u.searchParams.get("sig") ?? "";
  if (!key || !verifyKeySig(key, exp, sig)) return NextResponse.json({ error: "bad signature" }, { status: 403 });
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > 50 * 1024 * 1024) return NextResponse.json({ error: "too large" }, { status: 413 });
  await putObject(key, body, req.headers.get("content-type") ?? "application/octet-stream");
  return NextResponse.json({ ok: true, key });
}
