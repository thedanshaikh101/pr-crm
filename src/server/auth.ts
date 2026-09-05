"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { checkPassword, consumeToken, createSession, destroySession, hashPassword, hashToken, issueToken, rateLimit, registerUserAndAccount, requireViewer, requireRole, assertUserCapacity, newToken } from "@/lib/auth";
import { emailProvider } from "@/lib/email/provider";

const APP = () => process.env.APP_URL ?? "http://localhost:3000";
const ip = () => headers().get("x-forwarded-for") ?? "local";

async function sendSystemEmail(to: string, subject: string, html: string) {
  await emailProvider().send({ to, from: `Pressdesk <no-reply@${new URL(APP()).hostname}>`, subject, html, text: html.replace(/<[^>]+>/g, "") });
}

export async function register(_: unknown, form: FormData) {
  if (!rateLimit(`register:${ip()}`, 5, 6e5)) return { error: "Too many attempts. Try again in 10 minutes." };
  const p = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(10, "Use at least 10 characters"), workspace: z.string().min(2) }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  try {
    const { user, account } = await registerUserAndAccount(p.data);
    const t = await issueToken(user.id, "VERIFY_EMAIL", 60 * 24);
    await sendSystemEmail(user.email, "Verify your email", `<p>Confirm your email to finish setting up ${account.name}:</p><p><a href="${APP()}/verify?t=${t}">Verify email</a></p>`);
    await createSession(user.id, account.id);
    await audit(account.id, user.id, "account.create");
  } catch (e: any) { return { error: e.message }; }
  redirect("/dashboard");
}

export async function login(_: unknown, form: FormData) {
  const email = String(form.get("email") ?? "").toLowerCase();
  if (!rateLimit(`login:${ip()}:${email}`, 8, 9e5)) return { error: "Too many attempts. Try again in 15 minutes." };
  const user = await db.user.findUnique({ where: { email } });
  const ok = user?.passwordHash && (await checkPassword(String(form.get("password") ?? ""), user.passwordHash));
  if (!ok) return { error: "Email or password is wrong." };
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function sendMagicLink(_: unknown, form: FormData) {
  const email = String(form.get("email") ?? "").toLowerCase();
  if (!rateLimit(`magic:${email}`, 3, 9e5)) return { error: "Check your inbox; a link was already sent." };
  const user = await db.user.findUnique({ where: { email } });
  if (user) {
    const t = await issueToken(user.id, "MAGIC_LINK", 15);
    await sendSystemEmail(email, "Your sign-in link", `<p><a href="${APP()}/verify?t=${t}&m=1">Sign in to Pressdesk</a> (valid 15 minutes)</p>`);
  }
  return { ok: "If that email is registered, a sign-in link is on its way." };
}

export async function requestReset(_: unknown, form: FormData) {
  const email = String(form.get("email") ?? "").toLowerCase();
  if (!rateLimit(`reset:${email}`, 3, 9e5)) return { error: "Check your inbox; a link was already sent." };
  const user = await db.user.findUnique({ where: { email } });
  if (user) {
    const t = await issueToken(user.id, "RESET_PASSWORD", 30);
    await sendSystemEmail(email, "Reset your password", `<p><a href="${APP()}/reset?t=${t}">Choose a new password</a> (valid 30 minutes)</p>`);
  }
  return { ok: "If that email is registered, a reset link is on its way." };
}

export async function completeReset(_: unknown, form: FormData) {
  const t = String(form.get("t") ?? "");
  const password = String(form.get("password") ?? "");
  if (password.length < 10) return { error: "Use at least 10 characters." };
  const userId = await consumeToken(t, "RESET_PASSWORD");
  if (!userId) return { error: "This link is invalid or expired. Request a new one." };
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  await db.session.deleteMany({ where: { userId } });
  await createSession(userId);
  redirect("/dashboard");
}

export async function verifyToken(t: string, magic: boolean) {
  const userId = await consumeToken(t, magic ? "MAGIC_LINK" : "VERIFY_EMAIL");
  if (!userId) return false;
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  await createSession(userId);
  return true;
}

export async function switchAccount(accountId: string) {
  const v = await requireViewer();
  if (!v.memberships.some((m) => m.accountId === accountId)) throw new Error("Not a member");
  await db.session.update({ where: { id: v.session.id }, data: { activeAccountId: accountId } });
  redirect("/dashboard");
}

export async function inviteTeammate(form: FormData) {
  const v = await requireViewer();
  requireRole(v, "ADMIN");
  await assertUserCapacity(v.account.id, v.account.plan);
  const email = String(form.get("email") ?? "").toLowerCase();
  const role = (String(form.get("role") ?? "EDITOR") as any);
  const raw = newToken();
  await db.invitation.create({ data: { accountId: v.account.id, email, role, tokenHash: hashToken(raw), invitedBy: v.user.id, expiresAt: new Date(Date.now() + 7 * 864e5) } });
  await sendSystemEmail(email, `${v.user.name} invited you to ${v.account.name}`, `<p><a href="${APP()}/register?invite=${raw}">Accept the invitation</a></p>`);
  await audit(v.account.id, v.user.id, "team.invite", "invitation", undefined, { email, role });
}

export async function acceptInvite(raw: string, userId: string) {
  const inv = await db.invitation.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) return null;
  await db.membership.upsert({ where: { accountId_userId: { accountId: inv.accountId, userId } }, create: { accountId: inv.accountId, userId, role: inv.role }, update: {} });
  await db.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
  return inv.accountId as string;
}
