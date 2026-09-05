// Outbound webhooks: fan-out helper for other modules plus signing and retry maths for the worker.
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { enqueue } from "@/lib/queue";

export const WEBHOOK_EVENTS = ["release.published", "distribution.completed", "coverage.created", "contact.bounced", "conversation.created"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number] | "test";

export const MAX_ATTEMPTS = 5;
/** Delay before retry n (1-based attempt count after the failed try): 1m, 5m, 30m, 2h, 12h. */
export const BACKOFF_MINUTES = [1, 5, 30, 120, 720] as const;

export function backoffMinutes(attempts: number) {
  const i = Math.max(1, Math.min(attempts, BACKOFF_MINUTES.length)) - 1;
  return BACKOFF_MINUTES[i];
}

export function isSuccess(status: number | null | undefined) {
  return typeof status === "number" && status >= 200 && status < 300;
}

/** When to retry after a delivery attempt. Null when delivered or out of attempts. */
export function nextRetryAt(attempts: number, status: number | null, now = new Date()): Date | null {
  if (isSuccess(status)) return null;
  if (attempts >= MAX_ATTEMPTS) return null;
  return new Date(now.getTime() + backoffMinutes(attempts) * 60_000);
}

export function signPayload(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Accepts "sha256=<hex>" or a bare hex digest. Constant-time compare. */
export function verifySignature(secret: string, body: string, sig: string | null | undefined) {
  if (!sig) return false;
  const given = sig.replace(/^sha256=/, "").trim().toLowerCase();
  const expected = signPayload(secret, body);
  if (given.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex")); } catch { return false; }
}

export function deliveryHeaders(secret: string, body: string, event: string, deliveryId: string) {
  return {
    "content-type": "application/json",
    "user-agent": "Pressdesk-Webhooks/1.0",
    "X-Pressdesk-Event": event,
    "X-Pressdesk-Delivery": deliveryId,
    "X-Pressdesk-Signature": `sha256=${signPayload(secret, body)}`,
  };
}

export function deliveryBody(d: { id: string; event: string; createdAt: Date; payload: unknown }) {
  return JSON.stringify({ id: d.id, event: d.event, createdAt: d.createdAt.toISOString(), data: d.payload });
}

/** Create one WebhookDelivery per active endpoint subscribed to `event` and enqueue it. Returns the count. */
export async function emitWebhook(accountId: string, event: WebhookEvent, payload: Record<string, unknown>) {
  const endpoints = await db.webhookEndpoint.findMany({ where: { accountId, active: true, events: { has: event } }, select: { id: true } });
  let n = 0;
  for (const ep of endpoints) {
    const d = await db.webhookDelivery.create({ data: { endpointId: ep.id, event, payload: payload as any, nextRetryAt: new Date() } });
    await enqueueDelivery(d.id, 0);
    n++;
  }
  return n;
}

/** Enqueue the deliver job for one delivery. jobId includes the attempt so the sweep never double-queues. */
export async function enqueueDelivery(deliveryId: string, attempts: number) {
  return enqueue("webhooks", "deliver", { deliveryId }, { attempts: 1, jobId: `deliver-${deliveryId}-${attempts}` });
}
