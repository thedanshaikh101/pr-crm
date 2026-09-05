// Outbound webhook delivery with retries. Other modules create WebhookDelivery rows (directly or
// through emitWebhook); this worker POSTs them and the 5-minute sweep picks up anything due.
import type { Job } from "bullmq";
import { db } from "@/lib/db";
import { deliveryBody, deliveryHeaders, enqueueDelivery, isSuccess, MAX_ATTEMPTS, nextRetryAt } from "@/lib/settings/webhooks";
import type { JobModule } from "./types";

const TIMEOUT_MS = 10_000;

async function deliver(job: Job) {
  const { deliveryId } = job.data as { deliveryId: string };
  const d = await db.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { endpoint: true } });
  if (!d) return { skipped: "missing" };
  if (isSuccess(d.status)) return { skipped: "delivered" };
  if (d.attempts >= MAX_ATTEMPTS) return { skipped: "exhausted" };
  if (!d.endpoint.active) { await db.webhookDelivery.update({ where: { id: d.id }, data: { nextRetryAt: null } }); return { skipped: "inactive" }; }

  const body = deliveryBody(d);
  let status = 0;
  try {
    const res = await fetch(d.endpoint.url, { method: "POST", headers: deliveryHeaders(d.endpoint.secret, body, d.event, d.id), body, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual" });
    status = res.status;
  } catch (e) {
    status = 0;
    console.warn(`[webhooks] ${d.id} -> ${d.endpoint.url}: ${(e as Error).message}`);
  }
  const attempts = d.attempts + 1;
  const retryAt = nextRetryAt(attempts, status);
  await db.webhookDelivery.update({ where: { id: d.id }, data: { status, attempts, nextRetryAt: retryAt } });
  return { status, attempts, nextRetryAt: retryAt };
}

/** Every 5 minutes: enqueue anything due, including rows other modules created without enqueuing. */
async function retrySweep() {
  const now = new Date();
  const due = await db.webhookDelivery.findMany({
    where: { nextRetryAt: { lte: now }, attempts: { lt: MAX_ATTEMPTS }, OR: [{ status: null }, { status: { lt: 200 } }, { status: { gte: 300 } }], endpoint: { active: true } },
    select: { id: true, attempts: true }, orderBy: { nextRetryAt: "asc" }, take: 200,
  });
  for (const d of due) await enqueueDelivery(d.id, d.attempts);
  if (due.length) console.log(`[webhooks] sweep queued ${due.length} deliveries`);
  return { queued: due.length };
}

const mod: JobModule = {
  queue: "webhooks",
  processors: { deliver, "retry-sweep": retrySweep },
  schedules: [{ name: "retry-sweep", pattern: "*/5 * * * *" }],
  options: { concurrency: 5 },
};
export default mod;
