// Matches an inbound reply to a DistributionRecipient and records it. Used by the inbound webhook and the IMAP poller.
import { db } from "@/lib/db";
import { excerptOf, matchReply, messageIdTokens, parseAddress, REPLY_WINDOW_DAYS, type InboundMessage } from "./replies";

/** Load recipients that could be the parent of this reply, then apply the match. Shared with the IMAP poller. */
export async function applyInboundReply(msg: InboundMessage) {
  const tokens = messageIdTokens(msg.inReplyTo, msg.references);
  const from = parseAddress(msg.from);
  const since = new Date(Date.now() - REPLY_WINDOW_DAYS * 864e5);
  const rows = await db.distributionRecipient.findMany({
    where: { OR: [...(tokens.length ? [{ providerMsgId: { in: tokens } }] : []), ...(from ? [{ email: from, distribution: { createdAt: { gte: since } } }] : [])] },
    include: { distribution: { select: { startedAt: true, createdAt: true } } }, take: 50,
  });
  const hit = matchReply(msg, rows.map((r: any) => ({ id: r.id, providerMsgId: r.providerMsgId, email: r.email, sentAt: r.deliveredAt ?? r.distribution.startedAt ?? r.distribution.createdAt })));
  if (!hit) return null;
  const r = rows.find((x: any) => x.id === hit.id)!;
  const now = new Date();
  await db.$transaction([
    db.distributionRecipient.update({ where: { id: r.id }, data: { repliedAt: r.repliedAt ?? now } }),
    db.emailEvent.create({ data: { recipientId: r.id, type: "REPLIED", meta: { subject: msg.subject ?? null, excerpt: excerptOf(msg.text) }, createdAt: now } }),
  ]);
  if (r.contactId) await db.contact.update({ where: { id: r.contactId }, data: { lastContactedAt: now } }).catch(() => null);
  return r.id as string;
}

