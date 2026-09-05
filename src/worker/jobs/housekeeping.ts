// Nightly housekeeping: recycle-bin hard delete, retention policy, trial expiry, statement expiry.
import { db } from "@/lib/db";
import { deleteObject } from "@/lib/storage";
import { recycleCutoff, retentionCutoffs } from "@/lib/settings/retention";
import type { JobModule } from "./types";

/** 04:00 daily: permanently delete rows soft-deleted more than 30 days ago. */
async function hardDelete() {
  const cutoff = recycleCutoff();
  const where = { deletedAt: { lt: cutoff } };
  const counts: Record<string, number> = {};
  const contactIds = (await db.contact.findMany({ where, select: { id: true } })).map((c: any) => c.id as string);
  if (contactIds.length) {
    await db.$transaction([
      db.coverage.updateMany({ where: { contactId: { in: contactIds } }, data: { contactId: null } }),
      db.conversation.updateMany({ where: { contactId: { in: contactIds } }, data: { contactId: null } }),
      db.interviewRequest.updateMany({ where: { contactId: { in: contactIds } }, data: { contactId: null } }),
      db.distributionRecipient.updateMany({ where: { contactId: { in: contactIds } }, data: { contactId: null } }),
    ]);
  }
  counts.contacts = (await db.contact.deleteMany({ where })).count;
  const orgIds = (await db.organization.findMany({ where, select: { id: true } })).map((o: any) => o.id as string);
  if (orgIds.length) await db.$transaction([db.contact.updateMany({ where: { organizationId: { in: orgIds } }, data: { organizationId: null } }), db.coverage.updateMany({ where: { organizationId: { in: orgIds } }, data: { organizationId: null } })]);
  counts.organizations = (await db.organization.deleteMany({ where })).count;
  const listIds = (await db.list.findMany({ where, select: { id: true } })).map((l: any) => l.id as string);
  if (listIds.length) await db.distribution.updateMany({ where: { listId: { in: listIds } }, data: { listId: null } });
  counts.lists = (await db.list.deleteMany({ where })).count;
  const releaseIds = (await db.release.findMany({ where, select: { id: true } })).map((r: any) => r.id as string);
  if (releaseIds.length) await db.coverage.updateMany({ where: { releaseId: { in: releaseIds } }, data: { releaseId: null } });
  counts.releases = (await db.release.deleteMany({ where })).count;
  counts.coverage = (await db.coverage.deleteMany({ where })).count;
  const assets = await db.asset.findMany({ where, select: { id: true, storageKey: true } });
  for (const a of assets) if (a.storageKey) await deleteObject(a.storageKey).catch((e: Error) => console.warn(`[housekeeping] could not delete object ${a.storageKey}: ${e.message}`));
  counts.assets = (await db.asset.deleteMany({ where: { id: { in: assets.map((a: any) => a.id) } } })).count;
  console.log("[housekeeping] hard-delete", counts);
  return counts;
}

/** 04:30 daily: apply each account's retention policy to event-style tables. */
async function retention() {
  const accounts = await db.account.findMany({ where: { retentionDays: { not: null } }, select: { id: true, retentionDays: true } });
  const out: Record<string, Record<string, number>> = {};
  for (const { accountId, cutoff } of retentionCutoffs(accounts)) {
    const c: Record<string, number> = {};
    c.emailEvents = (await db.emailEvent.deleteMany({ where: { createdAt: { lt: cutoff }, recipient: { distribution: { accountId } } } })).count;
    const dists = await db.distribution.findMany({ where: { accountId, createdAt: { lt: cutoff }, recipients: { some: {} } }, select: { id: true, _count: { select: { recipients: true } } } });
    c.recipients = 0;
    for (const d of dists) {
      await db.distribution.update({ where: { id: d.id }, data: { recipientCount: Math.max(d._count.recipients, 0) } });
      c.recipients += (await db.distributionRecipient.deleteMany({ where: { distributionId: d.id } })).count;
    }
    c.auditLogs = (await db.auditLog.deleteMany({ where: { accountId, createdAt: { lt: cutoff } } })).count;
    c.pageviews = (await db.newsroomPageview.deleteMany({ where: { createdAt: { lt: cutoff }, release: { accountId } } })).count;
    out[accountId] = c;
  }
  console.log("[housekeeping] retention", out);
  return out;
}

/** 05:00 daily: suspend trials that ended without a subscription. */
async function trialExpiry() {
  const now = new Date();
  const due = await db.account.findMany({ where: { plan: "TRIAL", stripeSubId: null, trialEndsAt: { lt: now }, suspendedAt: null }, select: { id: true } });
  for (const a of due) {
    await db.account.update({ where: { id: a.id }, data: { suspendedAt: now, suspendedReason: "trial_expired" } });
    await db.auditLog.create({ data: { accountId: a.id, action: "account.trial_expired", entity: "account", entityId: a.id } });
  }
  console.log(`[housekeeping] trial-expiry suspended ${due.length} account(s)`);
  return { suspended: due.length };
}

/** 05:15 daily: approved statements past their expiry become EXPIRED. */
async function statementExpiry() {
  const r = await db.statement.updateMany({ where: { status: "APPROVED", expiresAt: { lt: new Date() } }, data: { status: "EXPIRED" } });
  console.log(`[housekeeping] statement-expiry expired ${r.count}`);
  return { expired: r.count };
}

const mod: JobModule = {
  queue: "housekeeping",
  processors: { "hard-delete": hardDelete, retention, "trial-expiry": trialExpiry, "statement-expiry": statementExpiry },
  schedules: [
    { name: "hard-delete", pattern: "0 4 * * *" },
    { name: "retention", pattern: "30 4 * * *" },
    { name: "trial-expiry", pattern: "0 5 * * *" },
    { name: "statement-expiry", pattern: "15 5 * * *" },
  ],
  options: { concurrency: 1 },
};
export default mod;
