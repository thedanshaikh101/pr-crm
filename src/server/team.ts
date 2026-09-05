"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword, checkPassword, requireRole, requireViewer } from "@/lib/auth";

export async function changeRole(membershipId: string, form: FormData) {
  const v = await requireViewer(); requireRole(v, "ADMIN");
  const role = String(form.get("role")) as any;
  if (role === "OWNER") requireRole(v, "OWNER");
  await db.membership.updateMany({ where: { id: membershipId, accountId: v.account.id }, data: { role } });
  await audit(v.account.id, v.user.id, "team.role_change", "membership", membershipId, { role });
  revalidatePath("/settings/team");
}

export async function deactivateMember(membershipId: string) {
  const v = await requireViewer(); requireRole(v, "ADMIN");
  await db.membership.updateMany({ where: { id: membershipId, accountId: v.account.id, NOT: { role: "OWNER" } }, data: { deactivatedAt: new Date() } });
  await audit(v.account.id, v.user.id, "team.deactivate", "membership", membershipId);
  revalidatePath("/settings/team");
}

export async function updateMe(form: FormData) {
  const v = await requireViewer();
  const data: any = { name: String(form.get("name") ?? v.user.name), timezone: String(form.get("timezone") ?? v.user.timezone), avatarUrl: String(form.get("avatarUrl") ?? "") || null,
    notifyPrefs: { opens: form.get("n_opens") === "on", replies: form.get("n_replies") === "on", digest: form.get("n_digest") === "on" } };
  const pw = String(form.get("newPassword") ?? "");
  if (pw) {
    const u = await db.user.findUnique({ where: { id: v.user.id } });
    if (!u?.passwordHash || !(await checkPassword(String(form.get("currentPassword") ?? ""), u.passwordHash))) throw new Error("Current password is wrong");
    if (pw.length < 10) throw new Error("Use at least 10 characters");
    data.passwordHash = await hashPassword(pw);
  }
  await db.user.update({ where: { id: v.user.id }, data });
  revalidatePath("/settings/me");
}

export async function updateSignature(form: FormData) {
  const v = await requireViewer();
  await db.user.update({ where: { id: v.user.id }, data: { signatureBlock: String(form.get("signatureBlock") ?? "") } });
  revalidatePath("/settings/signature");
}
