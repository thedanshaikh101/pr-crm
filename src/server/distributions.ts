"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertEmailCapacity, requireRole, requireViewer } from "@/lib/auth";
import { cleanHtml } from "@/lib/html";
import { enqueue, removeJob } from "@/lib/queue";
import { fromAllowed } from "@/lib/email/domains";
import { localToUtc } from "@/lib/releases/schedule";
import { resolveForAccount, type RecipientInput } from "@/lib/releases/gather";
import { basePath, recipientWhereFor, WHO_LABEL, type Kind, type Who } from "@/lib/releases/data";

const Recipients = z.object({ listIds: z.array(z.string()).default([]), contactIds: z.array(z.string()).default([]), adhoc: z.string().default("") });

export type RecipientSummary = { total: number; unique: number; duplicates: number; noValidEmail: number; suppressed: number; sending: number };

/** Live summary for the distribute screen. */
export async function previewRecipients(input: RecipientInput): Promise<RecipientSummary> {
  const v = await requireViewer();
  const r = await resolveForAccount(v.account.id, v.user.id, Recipients.parse(input));
  const { recipients: _r, ...summary } = r;
  return summary;
}

const DistributionInput = Recipients.extend({
  intent: z.enum(["test", "now", "schedule"]),
  subject: z.string().trim().min(1).max(300),
  preheader: z.string().trim().max(300).optional(),
  fromName: z.string().trim().min(1).max(120),
  fromEmail: z.string().trim().email(),
  replyTo: z.string().trim().email().optional().or(z.literal("")),
  intro: z.string().optional(),
  teaserMode: z.boolean().default(false),
  label: z.string().trim().max(120).optional(),
  scheduledFor: z.string().optional(), // datetime-local in the account timezone
  proactivity: z.enum(["PROACTIVE", "REACTIVE", "UNSET"]).optional(),
});
export type DistributionInputT = z.infer<typeof DistributionInput>;

export type CreateResult =
  | { ok: true; id: string; queued: boolean; summary: RecipientSummary; redirectTo: string }
  | { ok: false; error: string };

export async function createDistribution(releaseId: string, raw: DistributionInputT): Promise<CreateResult> {
  const v = await requireViewer();
  try {
    requireRole(v, "EDITOR");
    const input = DistributionInput.parse(raw);
    const release = await db.release.findFirst({ where: { id: releaseId, accountId: v.account.id, deletedAt: null } });
    if (!release) return { ok: false, error: "Release not found" };
    const domains = await db.sendingDomain.findMany({ where: { accountId: v.account.id }, select: { domain: true, status: true } });
    if (!fromAllowed(domains, input.fromEmail)) return { ok: false, error: `The from address must use a verified sending domain. Add and verify ${input.fromEmail.split("@")[1] ?? "a domain"} under Settings, Sending Domains.` };

    let scheduledFor: Date | null = null;
    if (input.intent === "schedule") {
      scheduledFor = input.scheduledFor ? localToUtc(input.scheduledFor, v.account.timezone) : null;
      if (!scheduledFor) return { ok: false, error: "Pick a date and time to schedule." };
      if (scheduledFor.getTime() < Date.now() - 6e4) return { ok: false, error: "The scheduled time is in the past." };
    }

    const isTest = input.intent === "test";
    const resolved = isTest
      ? { total: 1, unique: 1, duplicates: 0, noValidEmail: 0, suppressed: 0, sending: 1, recipients: [{ email: v.user.email.toLowerCase(), name: v.user.name, outlet: null, contactId: null }] }
      : await resolveForAccount(v.account.id, v.user.id, input);
    if (!resolved.recipients.length) return { ok: false, error: "Nobody to send to. Every recipient is missing a valid email or is on the suppression list." };
    await assertEmailCapacity(v.account.id, v.account.plan, resolved.recipients.length);

    if (input.proactivity && !isTest) await db.release.updateMany({ where: { id: releaseId, accountId: v.account.id }, data: { proactivity: input.proactivity } });

    const d = await db.distribution.create({ data: {
      accountId: v.account.id, releaseId, listId: !isTest && input.listIds.length === 1 ? input.listIds[0] : null, isTest,
      label: isTest ? `Test to ${v.user.email}` : input.label || (scheduledFor ? "Scheduled distribution" : "Live distribution"),
      status: "QUEUED", subject: input.subject, preheader: input.preheader || null, fromName: input.fromName, fromEmail: input.fromEmail.toLowerCase(), replyTo: input.replyTo || null,
      intro: input.intro ? cleanHtml(input.intro) : null, teaserMode: input.teaserMode, scheduledFor, sentById: v.user.id, recipientCount: resolved.recipients.length,
    } });
    await db.distributionRecipient.createMany({ data: resolved.recipients.map((r) => ({ distributionId: d.id, email: r.email, name: r.name, outlet: r.outlet, contactId: r.contactId })), skipDuplicates: true });
    if (!isTest && input.listIds.length) await db.releaseList.createMany({ data: input.listIds.map((listId) => ({ releaseId, listId })), skipDuplicates: true });

    const delay = scheduledFor ? Math.max(0, scheduledFor.getTime() - Date.now()) : 0;
    const jobId = await enqueue("sends", "distribute", { distributionId: d.id }, { delay, attempts: 1 });
    await db.distribution.update({ where: { id: d.id }, data: { jobId } });
    if (scheduledFor && !isTest && release.status !== "LIVE") await db.release.updateMany({ where: { id: releaseId, accountId: v.account.id }, data: { status: "SCHEDULED", scheduledFor } });
    await audit(v.account.id, v.user.id, isTest ? "distribution.test" : scheduledFor ? "distribution.schedule" : "distribution.send", "distribution", d.id, { releaseId, recipients: resolved.recipients.length, jobId, scheduledFor });

    const { recipients: _r, ...summary } = resolved;
    const base = `${basePath(release.kind as Kind)}/${releaseId}`;
    revalidatePath(base);
    return { ok: true, id: d.id, queued: !!jobId, summary, redirectTo: `${base}?tab=distribution&dist=${d.id}&queued=${jobId ? 1 : 0}&s=${[summary.unique, summary.noValidEmail, summary.suppressed, summary.sending].join(",")}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Remove the queued job and mark the distribution cancelled. */
export async function cancelDistribution(id: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const d = await db.distribution.findFirst({ where: { id, accountId: v.account.id }, include: { release: true } });
  if (!d) throw new Error("Distribution not found");
  if (d.status !== "QUEUED") throw new Error("Only queued distributions can be cancelled");
  if (d.jobId) await removeJob("sends", d.jobId);
  await db.distribution.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  const others = await db.distribution.count({ where: { releaseId: d.releaseId, isTest: false, status: { in: ["QUEUED", "SENDING", "SENT"] } } });
  if (!others && d.release.status === "SCHEDULED") await db.release.update({ where: { id: d.releaseId }, data: { status: "DRAFT", scheduledFor: null } });
  await audit(v.account.id, v.user.id, "distribution.cancel", "distribution", id, { releaseId: d.releaseId });
  const base = `${basePath(d.release.kind as Kind)}/${d.releaseId}`;
  revalidatePath(base);
  redirect(`${base}?tab=distribution`);
}

/** Build a fixed list from the recipients of one distribution filtered by engagement. */
export async function createListFromRecipients(distributionId: string, who: Who) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const d = await db.distribution.findFirst({ where: { id: distributionId, accountId: v.account.id }, include: { release: { select: { headline: true } } } });
  if (!d) throw new Error("Distribution not found");
  const rows = await db.distributionRecipient.findMany({ where: { distributionId, contactId: { not: null }, ...recipientWhereFor(who) }, select: { contactId: true } });
  const contactIds = Array.from(new Set(rows.map((r: any) => r.contactId as string)));
  const name = `${d.release.headline.slice(0, 60)} ${WHO_LABEL[who] ?? who}`;
  const l = await db.list.create({ data: { accountId: v.account.id, name, ownerId: v.user.id, editedById: v.user.id, members: { create: contactIds.map((contactId) => ({ contactId })) } } });
  await audit(v.account.id, v.user.id, "list.create", "list", l.id, { from: distributionId, who, count: contactIds.length });
  redirect(`/lists/${l.id}`);
}
