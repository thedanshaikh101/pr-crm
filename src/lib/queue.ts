// BullMQ queues shared by the app (producers) and the worker (consumers).
import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

export const QUEUES = ["sends", "verify", "imports", "reports", "webhooks", "housekeeping", "ingest"] as const;
export type QueueName = (typeof QUEUES)[number];

const g = globalThis as unknown as { pdRedis?: IORedis; pdQueues?: Partial<Record<QueueName, Queue>> };

export function redis() {
  if (!g.pdRedis) g.pdRedis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null, lazyConnect: true, enableOfflineQueue: true });
  return g.pdRedis;
}

export function queue(name: QueueName) {
  g.pdQueues ??= {};
  return (g.pdQueues[name] ??= new Queue(name, { connection: redis() }));
}

/** Add a job. Never throws on Redis trouble; returns null so callers can fall back or surface a warning. */
export async function enqueue<T = unknown>(name: QueueName, jobName: string, data: T, opts?: JobsOptions) {
  try {
    const job = await queue(name).add(jobName, data as any, { removeOnComplete: 500, removeOnFail: 1000, attempts: 3, backoff: { type: "exponential", delay: 5000 }, ...opts });
    return job.id ?? null;
  } catch (e) {
    console.error(`[queue] could not enqueue ${name}/${jobName}:`, (e as Error).message);
    return null;
  }
}

export async function removeJob(name: QueueName, jobId: string) {
  try { const j = await queue(name).getJob(jobId); if (j) await j.remove(); return true; } catch { return false; }
}

export async function queueDepths() {
  const out: Record<string, { waiting: number; active: number; delayed: number; failed: number }> = {};
  for (const n of QUEUES) {
    try { const c = await queue(n).getJobCounts("waiting", "active", "delayed", "failed"); out[n] = { waiting: c.waiting ?? 0, active: c.active ?? 0, delayed: c.delayed ?? 0, failed: c.failed ?? 0 }; }
    catch { out[n] = { waiting: -1, active: -1, delayed: -1, failed: -1 }; }
  }
  return out;
}
