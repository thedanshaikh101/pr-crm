import { db } from "@/lib/db";

import type { ProviderEvent } from "./normalize";
import { emitWebhook } from "@/lib/settings/webhooks";
export { normalizeResendEvent } from "./normalize";

/** Apply an event to recipient + contact + suppression list. Idempotent per event type where it matters. */
export async function applyEmailEvent(e: ProviderEvent) {
  const r = await db.distributionRecipient.findUnique({ where: { providerMsgId: e.providerMsgId }, include: { distribution: { select: { accountId: true } } } });
  if (!r) return false;
  const at = e.at ?? new Date();
  const patch: any = {};
  const typeMap: Record<string, string> = { delivered: "DELIVERED", opened: "OPENED", clicked: "CLICKED", bounced: "BOUNCED", complained: "COMPLAINED", unsubscribed: "UNSUBSCRIBED", dropped: "DROPPED", blocked: "BLOCKED" };
  if (e.type === "delivered") patch.deliveredAt = r.deliveredAt ?? at;
  if (e.type === "opened") { patch.firstOpenAt = r.firstOpenAt ?? at; patch.openCount = { increment: 1 }; }
  if (e.type === "clicked") { patch.clickCount = { increment: 1 }; patch.firstOpenAt = r.firstOpenAt ?? at; }
  if (e.type === "bounced") { patch.bouncedAt = at; patch.bounceType = e.bounceType ?? "hard"; }
  if (e.type === "complained") patch.complainedAt = at;
  if (e.type === "unsubscribed") patch.unsubscribedAt = at;
  if (e.type === "dropped") patch.droppedAt = at;
  if (e.type === "blocked") patch.blockedAt = at;
  await db.$transaction([
    db.distributionRecipient.update({ where: { id: r.id }, data: patch }),
    db.emailEvent.create({ data: { recipientId: r.id, type: typeMap[e.type] as any, url: e.url, createdAt: at } }),
  ]);
  const accountId = r.distribution.accountId;
  if ((e.type === "bounced" && e.bounceType !== "soft") || e.type === "complained" || e.type === "unsubscribed") {
    await db.suppression.upsert({ where: { accountId_email: { accountId, email: r.email } }, create: { accountId, email: r.email, reason: e.type === "bounced" ? "hard_bounce" : e.type === "complained" ? "complaint" : "unsubscribe" }, update: {} });
    if (r.contactId) await db.contact.update({ where: { id: r.contactId }, data: { emailStatus: e.type === "bounced" ? "BOUNCED" : e.type === "complained" ? "COMPLAINED" : "UNSUBSCRIBED" } });
    if (e.type === "bounced") await emitWebhook(accountId, "contact.bounced", { contactId: r.contactId, email: r.email, bounceType: e.bounceType ?? "hard", distributionId: r.distributionId }).catch(() => 0);
  }
  if (e.type === "delivered" && r.contactId) await db.contact.updateMany({ where: { id: r.contactId, emailStatus: { in: ["UNVERIFIED", "RISKY"] } }, data: { emailStatus: "VALID", emailVerifiedAt: at } });
  return true;
}
