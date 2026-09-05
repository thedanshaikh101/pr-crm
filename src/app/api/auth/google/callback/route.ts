import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createSession, slugify } from "@/lib/auth";
import { TRIAL_DAYS } from "@/lib/plans";
import { acceptInvite } from "@/server/auth";
import { appBase, googleRedirectUri } from "@/lib/settings/google";

export const dynamic = "force-dynamic";

type IdToken = { iss?: string; aud?: string; exp?: number; sub?: string; email?: string; email_verified?: boolean; name?: string; given_name?: string; picture?: string };

function decodeIdToken(t: string): IdToken | null {
  const parts = t.split(".");
  if (parts.length < 2) return null;
  try { return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); } catch { return null; }
}

async function createWorkspaceFor(p: IdToken) {
  const first = (p.given_name ?? p.name ?? p.email!.split("@")[0]).split(/\s+/)[0];
  const name = `${first}'s workspace`;
  let slug = slugify(name);
  while (await db.account.findUnique({ where: { slug } })) slug = `${slug}-${randomBytes(2).toString("hex")}`;
  const user = await db.user.create({ data: {
    email: p.email!, name: p.name ?? first, googleId: p.sub!, avatarUrl: p.picture ?? null, emailVerifiedAt: new Date(),
    isSuperAdmin: (process.env.SUPERADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).includes(p.email!.toLowerCase()),
  } });
  const account = await db.account.create({ data: {
    name, slug, trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 864e5),
    memberships: { create: { userId: user.id, role: "OWNER" } },
    tagGroups: { create: [{ name: "Client" }, { name: "Campaign" }, { name: "Topic" }] },
    newsroom: { create: {} },
  } });
  await audit(account.id, user.id, "account.create", "account", account.id, { via: "google" });
  return { user, account };
}

// GET /api/auth/google/callback?code=&state=
export async function GET(req: Request) {
  const base = appBase();
  const fail = () => NextResponse.redirect(`${base}/login?error=google`);
  const jar = cookies();
  try {
    const u = new URL(req.url);
    const code = u.searchParams.get("code");
    const state = u.searchParams.get("state");
    const expected = jar.get("g_state")?.value;
    const invite = jar.get("g_invite")?.value;
    jar.delete("g_state"); jar.delete("g_invite");
    const clientId = process.env.GOOGLE_CLIENT_ID, clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!code || !state || !expected || state !== expected || !clientId || !clientSecret) return fail();

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: googleRedirectUri(), grant_type: "authorization_code" }),
    });
    if (!tokenRes.ok) return fail();
    const tokens = (await tokenRes.json()) as { id_token?: string };
    const p = tokens.id_token ? decodeIdToken(tokens.id_token) : null;
    if (!p || p.aud !== clientId || !(p.iss === "accounts.google.com" || p.iss === "https://accounts.google.com") || !p.exp || p.exp * 1000 < Date.now() || !p.email_verified || !p.email || !p.sub) return fail();

    let user = await db.user.findUnique({ where: { googleId: p.sub } });
    if (!user) {
      const byEmail = await db.user.findUnique({ where: { email: p.email } });
      if (byEmail) user = await db.user.update({ where: { id: byEmail.id }, data: { googleId: p.sub, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(), avatarUrl: byEmail.avatarUrl ?? p.picture ?? null } });
    }
    let accountId: string | undefined;
    if (!user) {
      const created = await createWorkspaceFor(p);
      user = created.user; accountId = created.account.id;
    } else if ((await db.membership.count({ where: { userId: user.id, deactivatedAt: null } })) === 0 && !invite) {
      const first = (p.given_name ?? user.name).split(/\s+/)[0];
      const name = `${first}'s workspace`;
      let slug = slugify(name);
      while (await db.account.findUnique({ where: { slug } })) slug = `${slug}-${randomBytes(2).toString("hex")}`;
      const account = await db.account.create({ data: { name, slug, trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 864e5), memberships: { create: { userId: user.id, role: "OWNER" } }, tagGroups: { create: [{ name: "Client" }, { name: "Campaign" }, { name: "Topic" }] }, newsroom: { create: {} } } });
      accountId = account.id;
    }
    if (invite) {
      const joined = await acceptInvite(invite, user.id);
      if (joined) accountId = joined;
    }
    await createSession(user.id, accountId);
    return NextResponse.redirect(`${base}/dashboard`);
  } catch (e) {
    console.error("[google] sign-in failed:", (e as Error).message);
    return fail();
  }
}
