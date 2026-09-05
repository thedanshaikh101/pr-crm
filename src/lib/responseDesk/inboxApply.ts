// Shared by the inbox webhook route and the IMAP poller: turn one normalised email into a Conversation.
import type { PrismaClient } from "@prisma/client";
import { conversationFromEmail, type NormalizedEmail } from "./inbox";

export const INBOX_EVENT = "conversation.created";

export type ApplyResult = { conversationId: string; created: boolean; contactId: string | null };

export async function applyInboundEmail(db: PrismaClient, accountId: string, norm: NormalizedEmail): Promise<ApplyResult> {
  if (norm.messageId) {
    const dup = await db.conversation.findFirst({ where: { accountId, sourceMessageId: norm.messageId }, select: { id: true, contactId: true } });
    if (dup) return { conversationId: dup.id, created: false, contactId: dup.contactId };
  }
  const contact = norm.fromEmail
    ? await db.contact.findFirst({ where: { accountId, email: norm.fromEmail, deletedAt: null }, select: { id: true, organization: { select: { name: true } } } })
    : null;
  const data = conversationFromEmail(norm, contact);
  const c = await db.conversation.create({ data: { accountId, ...data } });
  await db.auditLog.create({ data: { accountId, userId: null, action: "conversation.create", entity: "conversation", entityId: c.id, meta: { source: "inbox", messageId: norm.messageId } } });

  const endpoints = await db.webhookEndpoint.findMany({ where: { accountId, active: true, events: { has: INBOX_EVENT } }, select: { id: true } });
  if (endpoints.length) {
    const payload = { conversationId: c.id, outletName: data.outletName, question: data.question.slice(0, 200) };
    await db.webhookDelivery.createMany({ data: endpoints.map((e: any) => ({ endpointId: e.id, event: INBOX_EVENT, payload, nextRetryAt: new Date() })) });
  }
  return { conversationId: c.id, created: true, contactId: contact?.id ?? null };
}
