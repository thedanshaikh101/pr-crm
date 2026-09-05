import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { queueDepths, redis } from "@/lib/queue";

export const dynamic = "force-dynamic";

function timed<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error("timeout")), ms); p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); }); });
}

// GET /api/healthz  (public, no tenant data): {ok, db: ms, redis: ms|null, queues}; 503 when the DB check fails.
export async function GET() {
  let dbMs: number | null = null;
  let redisMs: number | null = null;
  let queues: Record<string, unknown> = {};
  const t0 = Date.now();
  try { await timed(db.$queryRaw`SELECT 1`, 3000); dbMs = Date.now() - t0; } catch { dbMs = null; }
  const t1 = Date.now();
  try { await timed(redis().ping(), 1500); redisMs = Date.now() - t1; } catch { redisMs = null; }
  if (redisMs !== null) { try { queues = await timed(queueDepths(), 3000); } catch { queues = {}; } }
  const ok = dbMs !== null;
  return NextResponse.json({ ok, db: dbMs, redis: redisMs, queues, time: new Date().toISOString() }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
