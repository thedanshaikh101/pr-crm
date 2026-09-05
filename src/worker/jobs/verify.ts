// Nightly email verification: syntax + MX (+ SMTP probe when VERIFY_SMTP=1), 500 contacts per account per run.
import type { Job } from "bullmq";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { appHostname, canVerify, verifyEmail, type MxCache } from "@/lib/contacts/verify";
import type { JobModule } from "./types";

export const PER_ACCOUNT = 500;
export const RISKY_RECHECK_DAYS = 30;
const CONCURRENCY = 8;

async function verifyAccount(accountId: string, cache: MxCache, smtp: boolean, fromDomain: string) {
  const recheckBefore = new Date(Date.now() - RISKY_RECHECK_DAYS * 864e5);
  const contacts = await db.contact.findMany({
    where: { accountId, deletedAt: null, email: { not: null }, OR: [{ emailStatus: "UNVERIFIED" }, { emailStatus: "RISKY", OR: [{ emailVerifiedAt: null }, { emailVerifiedAt: { lt: recheckBefore } }] }] },
    select: { id: true, email: true, emailStatus: true }, orderBy: { updatedAt: "asc" }, take: PER_ACCOUNT,
  });
  const counts = { checked: 0, VALID: 0, INVALID: 0, RISKY: 0 };
  let i = 0;
  const worker = async () => {
    while (i < contacts.length) {
      const c = contacts[i++];
      if (!c.email || !canVerify(c.emailStatus)) continue;
      try {
        const r = await verifyEmail(c.email, { cache, smtp, fromDomain });
        // Pinned by accountId and to statuses verification may set, so a bounce recorded meanwhile is never overwritten.
        await db.contact.updateMany({ where: { id: c.id, accountId, emailStatus: { in: ["UNVERIFIED", "VALID", "INVALID", "RISKY"] } }, data: { emailStatus: r.verdict, emailVerifiedAt: new Date() } });
        counts.checked++; counts[r.verdict]++;
      } catch (e: any) {
        console.warn(`[verify] ${c.id}: ${e?.message ?? e}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, contacts.length) }, worker));
  return counts;
}

async function nightly(_job: Job) {
  const smtp = process.env.VERIFY_SMTP === "1";
  const fromDomain = appHostname();
  const cache: MxCache = new Map();
  const accounts = await db.account.findMany({ where: { suspendedAt: null }, select: { id: true } });
  const summary: Record<string, unknown> = {};
  for (const a of accounts) {
    const c = await verifyAccount(a.id, cache, smtp, fromDomain);
    summary[a.id] = c;
    if (c.checked) await audit(a.id, null, "contact.verify_nightly", "account", a.id, { ...c, smtp });
  }
  console.log(`[verify] nightly done, smtp=${smtp}, accounts=${accounts.length}, domains cached=${cache.size}`);
  return summary;
}

async function verifyOneAccount(job: Job<{ accountId: string }>) {
  const cache: MxCache = new Map();
  return verifyAccount(job.data.accountId, cache, process.env.VERIFY_SMTP === "1", appHostname());
}

export const verifyModule: JobModule = {
  queue: "verify",
  processors: { nightly, "verify-account": verifyOneAccount },
  schedules: [{ name: "nightly", pattern: "0 3 * * *" }],
  options: { concurrency: 1 },
};
