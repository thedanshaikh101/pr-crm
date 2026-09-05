// Fixed-window rate limiter on Redis, with an in-memory fallback when Redis is unreachable.
// Window semantics: the first hit sets PEXPIRE; every hit increments; allowed while count <= max.
import { redis } from "./queue";

type Bucket = { n: number; reset: number };
const buckets = new Map<string, Bucket>();

/** In-memory fixed window. Used directly by tests and as the fallback path. */
export function rateLimitMemory(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    return true;
  }
  if (b.n >= max) return false;
  b.n++;
  return true;
}

export function resetMemoryBuckets() { buckets.clear(); }

export type RateLimitClient = { incr(key: string): Promise<number>; pexpire(key: string, ms: number): Promise<unknown> };

const REDIS_TIMEOUT_MS = 500;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("redis timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Redis-backed fixed window against an injectable client; falls back to memory on any error. */
export async function rateLimitWith(client: RateLimitClient | null, key: string, max: number, windowMs: number): Promise<boolean> {
  if (!client) return rateLimitMemory(key, max, windowMs);
  const k = `rl:${key}`;
  try {
    const n = await withTimeout(client.incr(k), REDIS_TIMEOUT_MS);
    if (n === 1) await withTimeout(client.pexpire(k, windowMs), REDIS_TIMEOUT_MS);
    return n <= max;
  } catch {
    return rateLimitMemory(key, max, windowMs);
  }
}

/** rateLimit("login:1.2.3.4", 8, 15 * 60_000) -> true while under the limit for this window. */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  let client: RateLimitClient | null = null;
  try { client = redis(); } catch { client = null; }
  return rateLimitWith(client, key, max, windowMs);
}
