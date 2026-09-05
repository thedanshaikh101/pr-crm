import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const page = (title: string, body: string) => new Response(
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#1C1F26"><h1 style="font-size:22px">${title}</h1>${body}</body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
);

async function load(id: string) {
  return db.distributionRecipient.findUnique({ where: { id }, include: { distribution: { select: { accountId: true, fromName: true, account: { select: { name: true } } } } } });
}

/** Confirmation page with a form button (mail clients that do not support one-click land here). */
export async function GET(_req: Request, { params }: { params: { recipientId: string } }) {
  const r = await load(params.recipientId);
  if (!r) return page("Unsubscribe", "<p>This link is not valid.</p>");
  if (r.unsubscribedAt) return page("You're unsubscribed", `<p>${r.email} will not receive further emails from ${r.distribution.account.name}.</p>`);
  return page("Unsubscribe", `<p>Stop receiving emails from ${r.distribution.account.name} at <strong>${r.email}</strong>?</p><form method="post"><button type="submit" style="padding:10px 18px;font-size:15px;background:#1F5FBF;color:#fff;border:0;border-radius:6px;cursor:pointer">Unsubscribe</button></form>`);
}

/** One-click (RFC 8058) and the confirmation form both POST here. */
export async function POST(_req: Request, { params }: { params: { recipientId: string } }) {
  const r = await load(params.recipientId);
  if (!r) return page("Unsubscribe", "<p>This link is not valid.</p>");
  const accountId = r.distribution.accountId;
  const now = new Date();
  if (!r.unsubscribedAt) {
    await db.$transaction([
      db.distributionRecipient.update({ where: { id: r.id }, data: { unsubscribedAt: now } }),
      db.emailEvent.create({ data: { recipientId: r.id, type: "UNSUBSCRIBED", createdAt: now } }),
      db.suppression.upsert({ where: { accountId_email: { accountId, email: r.email } }, create: { accountId, email: r.email, reason: "unsubscribe" }, update: {} }),
    ]);
    if (r.contactId) await db.contact.update({ where: { id: r.contactId }, data: { emailStatus: "UNSUBSCRIBED" } }).catch(() => null);
    await db.auditLog.create({ data: { accountId, action: "contact.unsubscribe", entity: "distributionRecipient", entityId: r.id, meta: { email: r.email } } });
  }
  return page("You're unsubscribed", `<p>${r.email} will not receive further emails from ${r.distribution.account.name}.</p>`);
}
