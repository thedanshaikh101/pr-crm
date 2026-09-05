"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireRole, requireViewer } from "@/lib/auth";
import { gdprSearch as search, type GdprMatches } from "@/lib/gdpr/search";
import { planPurge, scrubText, type PurgePlan } from "@/lib/gdpr/purge";

export async function gdprSearch(q: string): Promise<GdprMatches> {
  const v = await requireViewer(); requireRole(v, "ADMIN");
  return search(db, v.account.id, q);
}

async function runStep(step: PurgePlan["steps"][number], accountId: string) {
  switch (step.op) {
    case "nullContactRefs": {
      const where = step.table === "distributionRecipient" ? { contactId: { in: step.contactIds } } : { accountId, contactId: { in: step.contactIds } };
      await (db as any)[step.table].updateMany({ where, data: { contactId: null } });
      return;
    }
    case "deleteContacts": await db.contact.deleteMany({ where: { id: { in: step.ids }, accountId } }); return;
    case "redactRecipients":
      for (const r of step.rows) await db.distributionRecipient.updateMany({ where: { id: r.id, distribution: { accountId } }, data: { email: r.email, name: r.name, outlet: null } });
      return;
    case "deleteSuppressions": await db.suppression.deleteMany({ where: { id: { in: step.ids }, accountId } }); return;
    case "deleteInvitations": await db.invitation.deleteMany({ where: { id: { in: step.ids }, accountId } }); return;
    case "scrubNotes": {
      const notes = await db.note.findMany({ where: { id: { in: step.ids }, accountId }, select: { id: true, body: true } });
      for (const n of notes) await db.note.update({ where: { id: n.id }, data: { body: scrubText(n.body, step.needle) } });
      return;
    }
    case "scrubAuditMeta": await db.auditLog.updateMany({ where: { id: { in: step.ids }, accountId }, data: { meta: { redacted: true } } }); return;
  }
}

export async function gdprPurge(fd: FormData) {
  const v = await requireViewer(); requireRole(v, "ADMIN");
  const q = String(fd.get("q") ?? "").trim();
  if (String(fd.get("confirm") ?? "").trim() !== "PURGE") redirect(`/settings/gdpr?q=${encodeURIComponent(q)}&error=confirm`);
  if (q.length < 3) redirect(`/settings/gdpr?error=short`);
  const matches = await search(db, v.account.id, q);
  const plan = planPurge(matches);
  for (const step of plan.steps) await runStep(step, v.account.id);
  await audit(v.account.id, v.user.id, "gdpr.purge", "account", v.account.id, { queryHash: plan.queryHash, counts: plan.counts });
  revalidatePath("/settings/gdpr");
  redirect(`/settings/gdpr?done=${encodeURIComponent(JSON.stringify(plan.counts))}`);
}
