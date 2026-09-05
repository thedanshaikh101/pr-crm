import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { db } from "./db";
import { limitsFor, PlanLimitError, TRIAL_DAYS } from "./plans";

const COOKIE = "pd_session";
const SESSION_DAYS = 30;

export function hashToken(t: string) {
  return createHash("sha256").update(t + (process.env.SESSION_SECRET ?? "")).digest("hex");
}
export function newToken() {
  return randomBytes(32).toString("base64url");
}
export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const checkPassword = (p: string, h: string) => bcrypt.compare(p, h);

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "workspace";
}

// ------------------------------------------------------------ sessions

export async function createSession(userId: string, accountId?: string) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  const h = headers();
  const session = await db.session.create({
    data: {
      userId,
      activeAccountId: accountId,
      expiresAt,
      ip: h.get("x-forwarded-for") ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
    },
  });
  cookies().set(COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  await db.user.update({ where: { id: userId }, data: { lastSignInAt: new Date() } });
  return session;
}

export async function destroySession() {
  const id = cookies().get(COOKIE)?.value;
  if (id) await db.session.deleteMany({ where: { id } });
  cookies().delete(COOKIE);
}

export type Viewer = {
  session: { id: string; impersonatedBy: string | null };
  user: { id: string; email: string; name: string; isSuperAdmin: boolean; timezone: string; lastSignInAt: Date | null; avatarUrl: string | null };
  account: { id: string; name: string; slug: string; plan: string; timezone: string; trialEndsAt: Date | null; suspendedAt: Date | null; suspendedReason: string | null };
  role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
  memberships: { accountId: string; name: string; role: string }[];
};

/** Resolve the current user + active account, or null. Every server action and
 *  page in the (app) group calls requireViewer(); accountId from here is the ONLY
 *  tenancy key ever used in queries. */
export async function getViewer(): Promise<Viewer | null> {
  const id = cookies().get(COOKIE)?.value;
  if (!id) return null;
  const session = await db.session.findUnique({
    where: { id },
    include: { user: { include: { memberships: { where: { deactivatedAt: null }, include: { account: true } } } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const u = session.user;
  const memberships = u.memberships as any[];
  let m = memberships.find((x) => x.accountId === session.activeAccountId) ?? (session.impersonatedBy ? undefined : memberships[0]);
  // super-admin impersonation
  if (!m && session.impersonatedBy && session.activeAccountId) {
    const account = await db.account.findUnique({ where: { id: session.activeAccountId } });
    if (account) m = { account, accountId: account.id, role: "OWNER" };
  }
  if (!m) return null;
  return {
    session: { id: session.id, impersonatedBy: session.impersonatedBy },
    user: { id: u.id, email: u.email, name: u.name, isSuperAdmin: u.isSuperAdmin, timezone: u.timezone, lastSignInAt: u.lastSignInAt, avatarUrl: u.avatarUrl },
    account: {
      id: m.account.id, name: m.account.name, slug: m.account.slug, plan: m.account.plan,
      timezone: m.account.timezone, trialEndsAt: m.account.trialEndsAt, suspendedAt: m.account.suspendedAt, suspendedReason: m.account.suspendedReason ?? null,
    },
    role: m.role,
    memberships: memberships.map((x) => ({ accountId: x.accountId, name: x.account.name, role: x.role })),
  };
}

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (v.account.suspendedAt) {
    // Expired trials may still reach billing to subscribe. Middleware sets x-pd-path.
    const path = headers().get("x-pd-path") ?? "";
    const billing = v.account.suspendedReason === "trial_expired" && path.startsWith("/settings/billing");
    if (!billing) redirect("/suspended");
  }
  return v;
}

const RANK = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 } as const;
export function requireRole(v: Viewer, min: keyof typeof RANK) {
  if (RANK[v.role] < RANK[min]) throw new Error(`Requires ${min} role`);
}

// ------------------------------------------------------------ signup

export async function registerUserAndAccount(input: { email: string; password: string; name: string; workspace: string }) {
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) throw new Error("An account with that email already exists. Sign in instead.");
  let slug = slugify(input.workspace);
  while (await db.account.findUnique({ where: { slug } })) slug = `${slug}-${randomBytes(2).toString("hex")}`;
  const user = await db.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      isSuperAdmin: (process.env.SUPERADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).includes(input.email.toLowerCase()),
    },
  });
  const account = await db.account.create({
    data: {
      name: input.workspace,
      slug,
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 864e5),
      memberships: { create: { userId: user.id, role: "OWNER" } },
      tagGroups: { create: [{ name: "Client" }, { name: "Campaign" }, { name: "Topic" }] },
      newsroom: { create: {} },
    },
  });
  return { user, account };
}

export async function issueToken(userId: string, purpose: "VERIFY_EMAIL" | "MAGIC_LINK" | "RESET_PASSWORD", minutes = 60) {
  const raw = newToken();
  await db.verificationToken.create({
    data: { userId, purpose, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + minutes * 6e4) },
  });
  return raw;
}

export async function consumeToken(raw: string, purpose: string) {
  const t = await db.verificationToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!t || t.purpose !== purpose || t.usedAt || t.expiresAt < new Date()) return null;
  await db.verificationToken.update({ where: { id: t.id }, data: { usedAt: new Date() } });
  return t.userId as string;
}

// ------------------------------------------------------------ plan limits

export async function assertContactCapacity(accountId: string, plan: string, adding = 1) {
  const max = limitsFor(plan).contacts;
  const count = await db.contact.count({ where: { accountId, deletedAt: null } });
  if (count + adding > max) throw new PlanLimitError("contacts", max);
}

export async function assertUserCapacity(accountId: string, plan: string) {
  const max = limitsFor(plan).users;
  const count = await db.membership.count({ where: { accountId, deactivatedAt: null } });
  if (count + 1 > max) throw new PlanLimitError("users", max);
}

export async function assertEmailCapacity(accountId: string, plan: string, adding: number) {
  const max = limitsFor(plan).emailsPerMonth;
  const period = new Date().toISOString().slice(0, 7);
  const c = await db.usageCounter.findUnique({ where: { accountId_period: { accountId, period } } });
  if ((c?.emailsSent ?? 0) + adding > max) throw new PlanLimitError("emailsPerMonth", max);
}

// ------------------------------------------------------------ rate limit (Redis fixed window, in-memory fallback; see src/lib/ratelimit.ts)
export { rateLimit } from "./ratelimit";
