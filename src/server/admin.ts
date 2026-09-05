"use server";
// Super-admin actions. Every write is audited under the target account with the super-admin's user id
// and an action prefixed "admin.".
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireViewer, type Viewer } from "@/lib/auth";
import { KNOWN_FLAGS, mergeFeatureFlags } from "@/lib/admin/metrics";

async function requireSuperAdmin(): Promise<Viewer> {
  const v = await requireViewer();
  if (!v.user.isSuperAdmin) throw new Error("Super-admin only");
  return v;
}

async function target(accountId: string) {
  const a = await db.account.findUnique({ where: { id: accountId } });
  if (!a) throw new Error("Account not found");
  return a;
}

/** Switch this session to view the given account as an OWNER. Exits via exitImpersonation(). */
export async function impersonate(accountId: string) {
  const v = await requireSuperAdmin();
  const a = await target(accountId);
  await db.session.update({ where: { id: v.session.id }, data: { activeAccountId: a.id, impersonatedBy: v.session.impersonatedBy ?? v.user.id } });
  await audit(a.id, v.user.id, "admin.impersonate", "account", a.id, { sessionId: v.session.id });
  redirect("/dashboard");
}

/** Restore the super-admin's own first membership account and clear impersonatedBy. */
export async function exitImpersonation() {
  const v = await requireViewer();
  if (!v.session.impersonatedBy) redirect("/dashboard");
  const own = await db.membership.findFirst({ where: { userId: v.user.id, deactivatedAt: null }, orderBy: { createdAt: "asc" }, select: { accountId: true } });
  await db.session.update({ where: { id: v.session.id }, data: { activeAccountId: own?.accountId ?? null, impersonatedBy: null } });
  await audit(v.account.id, v.user.id, "admin.impersonate_exit", "account", v.account.id);
  redirect("/admin");
}

export async function suspendAccount(accountId: string, form: FormData) {
  const v = await requireSuperAdmin();
  const a = await target(accountId);
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500) || "Suspended by support";
  await db.account.update({ where: { id: a.id }, data: { suspendedAt: new Date(), suspendedReason: reason } });
  await audit(a.id, v.user.id, "admin.suspend", "account", a.id, { reason });
  revalidatePath(`/admin/${a.id}`); revalidatePath("/admin");
}

export async function unsuspendAccount(accountId: string) {
  const v = await requireSuperAdmin();
  const a = await target(accountId);
  await db.account.update({ where: { id: a.id }, data: { suspendedAt: null, suspendedReason: null } });
  await audit(a.id, v.user.id, "admin.unsuspend", "account", a.id);
  revalidatePath(`/admin/${a.id}`); revalidatePath("/admin");
}

export async function saveFeatureFlags(accountId: string, form: FormData) {
  const v = await requireSuperAdmin();
  const a = await target(accountId);
  const checked = form.getAll("flag").map(String).filter((f) => (KNOWN_FLAGS as readonly string[]).includes(f));
  const flags = mergeFeatureFlags(checked, String(form.get("extra") ?? ""));
  await db.account.update({ where: { id: a.id }, data: { featureFlags: flags as any } });
  await audit(a.id, v.user.id, "admin.feature_flags", "account", a.id, { flags });
  revalidatePath(`/admin/${a.id}`);
}

export async function setRetentionDays(accountId: string, form: FormData) {
  const v = await requireSuperAdmin();
  const a = await target(accountId);
  const raw = String(form.get("retentionDays") ?? "").trim();
  const days = raw ? z.coerce.number().int().min(1).max(3650).parse(raw) : null;
  await db.account.update({ where: { id: a.id }, data: { retentionDays: days } });
  await audit(a.id, v.user.id, "admin.retention", "account", a.id, { retentionDays: days });
  revalidatePath(`/admin/${a.id}`);
}

export async function overridePlan(accountId: string, form: FormData) {
  const v = await requireSuperAdmin();
  const a = await target(accountId);
  const p = z.object({ plan: z.enum(["TRIAL", "STARTER", "AGENCY", "ENTERPRISE"]), billingInterval: z.enum(["", "month", "year"]).default(""), note: z.string().max(500).default("") }).parse(Object.fromEntries(form));
  const data: any = { plan: p.plan, billingInterval: p.billingInterval || null };
  if (p.plan === "TRIAL" && !a.trialEndsAt) data.trialEndsAt = new Date(Date.now() + 14 * 864e5);
  await db.account.update({ where: { id: a.id }, data });
  await audit(a.id, v.user.id, "admin.plan_override", "account", a.id, { from: a.plan, to: p.plan, billingInterval: p.billingInterval || null, note: p.note });
  revalidatePath(`/admin/${a.id}`); revalidatePath("/admin");
}

export async function setThrottle(accountId: string, form: FormData) {
  const v = await requireSuperAdmin();
  const a = await target(accountId);
  const n = z.coerce.number().int().min(1).max(10_000).parse(form.get("throttlePerMinute"));
  await db.account.update({ where: { id: a.id }, data: { throttlePerMinute: n } });
  await audit(a.id, v.user.id, "admin.throttle", "account", a.id, { throttlePerMinute: n });
  revalidatePath(`/admin/${a.id}`);
}
