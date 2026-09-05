// Queue "sends": distribute a release to its recipients, and poll IMAP for replies.
import type { Job } from "bullmq";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { emailProvider, htmlToText } from "@/lib/email/provider";
import { formatFrom } from "@/lib/email/domains";
import { applyInboundReply } from "@/lib/email/applyReply";
import { APP_URL, buildRenderInput, newsroomUrl } from "@/lib/releases/data";
import { mergeVarsFor, personalise, renderReleaseHtml, rewriteLinks } from "@/lib/releases/render";
import type { JobModule } from "./types";

const BATCH = 50;
const RECHECK_EVERY = 25;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function newLinkCode(n = 10) {
  const bytes = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function isCancelled(id: string) {
  const d = await db.distribution.findUnique({ where: { id }, select: { status: true } });
  return !d || d.status === "CANCELLED";
}

export async function distribute(job: Job<{ distributionId: string }>) {
  const { distributionId } = job.data;
  const d = await db.distribution.findUnique({ where: { id: distributionId }, include: { release: { include: { attachments: { include: { asset: true } }, account: true } } } });
  if (!d) { console.warn(`[sends] distribution ${distributionId} not found`); return; }
  if (d.status === "CANCELLED") return;
  const account = d.release.account;
  const input = await buildRenderInput(account.id, d.release);
  const app = APP_URL();
  const nUrl = newsroomUrl(account.slug, d.release.slug);
  await db.distribution.update({ where: { id: d.id }, data: { status: "SENDING", startedAt: d.startedAt ?? new Date() } });
  const provider = emailProvider();
  const perMinute = Math.max(1, d.throttlePerMinute ?? account.throttlePerMinute ?? 300);
  const gapMs = Math.ceil(60000 / perMinute);
  const from = formatFrom(d.fromName, d.fromEmail);
  const listMailto = `mailto:${d.replyTo ?? d.fromEmail}?subject=unsubscribe`;

  let sent = 0, failed = 0, skipped = 0, cursor: string | undefined, processed = 0, stopped = false;
  const sentContactIds: string[] = [];
  while (!stopped) {
    const batch = await db.distributionRecipient.findMany({ where: { distributionId: d.id }, orderBy: { id: "asc" }, take: BATCH, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), include: { contact: { select: { firstName: true, lastName: true, jobTitle: true, email: true, organization: { select: { name: true } } } } } });
    if (!batch.length) break;
    for (const r of batch as any[]) {
      cursor = r.id;
      processed++;
      if (processed % RECHECK_EVERY === 0 && (await isCancelled(d.id))) { stopped = true; break; }
      if (r.deliveredAt || r.providerMsgId) { skipped++; continue; }
      const suppressed = await db.suppression.findUnique({ where: { accountId_email: { accountId: account.id, email: r.email } } });
      if (suppressed) {
        await db.$transaction([
          db.distributionRecipient.update({ where: { id: r.id }, data: { droppedAt: new Date(), error: `suppressed: ${suppressed.reason}` } }),
          db.emailEvent.create({ data: { recipientId: r.id, type: "DROPPED", meta: { reason: suppressed.reason } } }),
        ]);
        skipped++;
        continue;
      }
      try {
        const vars = mergeVarsFor(r.contact ? { ...r.contact, outlet: r.contact.organization?.name ?? r.outlet } : { name: r.name, email: r.email, outlet: r.outlet });
        const raw = renderReleaseHtml(input, {
          mode: "email", accountName: account.name, preheader: d.preheader, unsubscribeUrl: `${app}/u/${r.id}`, trackingPixelUrl: `${app}/o/${r.id}`,
          wrapper: { intro: d.intro, teaserMode: d.teaserMode, newsroomUrl: nUrl },
        });
        const personal = personalise(raw, vars);
        const links: { code: string; targetUrl: string }[] = [];
        const { html } = rewriteLinks(personal, (url) => {
          if (url.startsWith(`${app}/u/`) || url.startsWith(`${app}/o/`)) return url;
          const code = newLinkCode();
          links.push({ code, targetUrl: url });
          return `${app}/t/${code}`;
        });
        if (links.length) await db.trackedLink.createMany({ data: links.map((l) => ({ ...l, recipientId: r.id })) });
        const res = await provider.send({
          to: r.name ? `${r.name.replace(/["<>]/g, "")} <${r.email}>` : r.email, from, replyTo: d.replyTo ?? undefined,
          subject: personalise(d.subject, vars), html, text: htmlToText(html),
          headers: { "List-Unsubscribe": `<${app}/u/${r.id}>, <${listMailto}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click", "X-Pressdesk-Recipient": r.id },
          tags: { distribution: d.id, release: d.releaseId },
        });
        await db.$transaction([
          db.distributionRecipient.update({ where: { id: r.id }, data: { providerMsgId: res.providerMsgId, error: null } }),
          db.emailEvent.create({ data: { recipientId: r.id, type: "SENT" } }),
        ]);
        const period = new Date().toISOString().slice(0, 7);
        await db.usageCounter.upsert({ where: { accountId_period: { accountId: account.id, period } }, create: { accountId: account.id, period, emailsSent: 1 }, update: { emailsSent: { increment: 1 } } });
        if (r.contactId) sentContactIds.push(r.contactId);
        sent++;
      } catch (e) {
        failed++;
        await db.distributionRecipient.update({ where: { id: r.id }, data: { error: (e as Error).message.slice(0, 500) } }).catch(() => null);
        console.error(`[sends] ${d.id} -> ${r.email}: ${(e as Error).message}`);
      }
      await sleep(gapMs);
    }
    if (batch.length < BATCH) break;
  }

  if (stopped) { console.log(`[sends] ${d.id} cancelled after ${sent} sends`); return { sent, failed, skipped, cancelled: true }; }
  const total = await db.distributionRecipient.count({ where: { distributionId: d.id } });
  const status = failed > 0 && sent === 0 && skipped < total ? "FAILED" : "SENT";
  await db.distribution.update({ where: { id: d.id }, data: { status, completedAt: new Date(), recipientCount: total } });
  if (sentContactIds.length) await db.contact.updateMany({ where: { id: { in: sentContactIds } }, data: { lastContactedAt: new Date() } });

  let wentLive = false;
  if (!d.isTest && d.release.status !== "LIVE") {
    await db.release.update({ where: { id: d.releaseId }, data: { status: "LIVE", publishedAt: d.release.publishedAt ?? new Date() } });
    wentLive = true;
  }
  const hooks = await db.webhookEndpoint.findMany({ where: { accountId: account.id, active: true }, select: { id: true, events: true } });
  const deliveries: any[] = [];
  for (const h of hooks as any[]) {
    if (h.events.includes("distribution.completed")) deliveries.push({ endpointId: h.id, event: "distribution.completed", payload: { distributionId: d.id, releaseId: d.releaseId, sent, failed }, nextRetryAt: new Date() });
    if (wentLive && h.events.includes("release.published")) deliveries.push({ endpointId: h.id, event: "release.published", payload: { releaseId: d.releaseId, headline: d.release.headline, url: nUrl }, nextRetryAt: new Date() });
  }
  if (deliveries.length) await db.webhookDelivery.createMany({ data: deliveries });
  await db.auditLog.create({ data: { accountId: account.id, userId: d.sentById, action: "distribution.completed", entity: "distribution", entityId: d.id, meta: { sent, failed, skipped, status } } });
  console.log(`[sends] ${d.id} ${status}: sent=${sent} failed=${failed} skipped=${skipped}`);
  return { sent, failed, skipped };
}

/** Poll the reply-to inbox over IMAP. Skips cleanly when IMAP is not configured; imapflow is only imported here. */
export async function replyCheck() {
  const { IMAP_HOST, IMAP_USER, IMAP_PASS } = process.env;
  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) { console.log("reply-check skipped: IMAP not configured"); return { skipped: true }; }
  const mod: any = await import("imapflow");
  const ImapFlow = mod.ImapFlow ?? mod.default?.ImapFlow ?? mod.default;
  const client = new ImapFlow({ host: IMAP_HOST, port: Number(process.env.IMAP_PORT ?? 993), secure: true, auth: { user: IMAP_USER, pass: IMAP_PASS }, logger: false });
  let matched = 0, seen = 0;
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - 3 * 864e5);
      for await (const msg of client.fetch({ seen: false, since }, { envelope: true, headers: ["in-reply-to", "references"], source: { maxLength: 20000 } })) {
        seen++;
        const headers = String(msg.headers ?? "");
        const pick = (name: string) => { const m = new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=\\r?\\n\\S|$)`, "im").exec(headers); return m ? m[1].replace(/\r?\n\s+/g, " ").trim() : null; };
        const from = msg.envelope?.from?.[0];
        const fromStr = from ? `${from.name ?? ""} <${from.address ?? ""}>` : "";
        const text = msg.source ? Buffer.from(msg.source).toString("utf8").split(/\r?\n\r?\n/).slice(1).join("\n\n") : "";
        const id = await applyInboundReply({ from: fromStr, subject: msg.envelope?.subject ?? null, inReplyTo: pick("in-reply-to"), references: pick("references"), text });
        if (id) matched++;
      }
    } finally { lock.release(); }
  } finally { await client.logout().catch(() => null); }
  console.log(`[sends] reply-check: ${seen} messages, ${matched} matched`);
  return { seen, matched };
}

export const sendsJobs: JobModule = {
  queue: "sends",
  processors: { distribute: (job) => distribute(job as Job<{ distributionId: string }>), "reply-check": () => replyCheck() },
  schedules: [{ name: "reply-check", pattern: "*/10 * * * *" }],
  options: { concurrency: 2 },
};
