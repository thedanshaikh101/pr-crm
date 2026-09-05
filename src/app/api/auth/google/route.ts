import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { appBase, googleRedirectUri } from "@/lib/settings/google";

export const dynamic = "force-dynamic";

// GET /api/auth/google?invite=   Starts the Google OAuth consent flow.
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const base = appBase();
  if (!clientId) return NextResponse.redirect(`${base}/login?error=google`);
  const state = randomBytes(16).toString("base64url");
  const invite = new URL(req.url).searchParams.get("invite") ?? "";
  const secure = process.env.NODE_ENV === "production";
  const jar = cookies();
  jar.set("g_state", state, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 600 });
  if (invite) jar.set("g_invite", invite, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 600 });
  else jar.delete("g_invite");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return NextResponse.redirect(url.toString());
}
