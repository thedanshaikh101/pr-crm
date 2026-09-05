// Canonical newsroom URLs. Pure so the short link route and OG tags agree on one answer.

export type NewsroomEnv = { appUrl: string; newsroomDomain: string };
export type NewsroomAccountRef = { slug: string };
export type NewsroomSettingsRef = { customDomain?: string | null; domainVerifiedAt?: Date | string | null } | null | undefined;

export const DEFAULT_NEWSROOM_DOMAIN = "newsroom.localhost";

export function envFromProcess(): NewsroomEnv {
  return { appUrl: process.env.APP_URL || "http://localhost:3000", newsroomDomain: process.env.NEWSROOM_DOMAIN || DEFAULT_NEWSROOM_DOMAIN };
}

/** The out-of-the-box NEWSROOM_DOMAIN only works in a browser on the developer's machine. */
export function isLocalNewsroomDomain(domain: string) {
  const d = (domain ?? "").trim().toLowerCase();
  return !d || d === "localhost" || d.endsWith(".localhost") || d.startsWith("127.");
}

export function appHostFrom(appUrl: string) {
  try { return new URL(appUrl).host; } catch { return "localhost:3000"; }
}

export function hasVerifiedDomain(settings: NewsroomSettingsRef): settings is { customDomain: string; domainVerifiedAt: Date | string } {
  return !!settings?.customDomain && !!settings.domainVerifiedAt;
}

/** Absolute base URL of an account's newsroom, no trailing slash. */
export function newsroomBaseUrl(account: NewsroomAccountRef, settings: NewsroomSettingsRef, env: NewsroomEnv) {
  if (hasVerifiedDomain(settings)) return `https://${settings.customDomain.toLowerCase()}`;
  if (!isLocalNewsroomDomain(env.newsroomDomain)) return `https://${account.slug}.${env.newsroomDomain}`;
  return `${env.appUrl.replace(/\/+$/, "")}/n/${account.slug}`;
}

export function canonicalReleaseUrl(account: NewsroomAccountRef, settings: NewsroomSettingsRef, release: { slug: string }, env: NewsroomEnv) {
  return `${newsroomBaseUrl(account, settings, env)}/${release.slug}`;
}

/** Where a customer's CNAME should point. */
export function cnameTarget(account: NewsroomAccountRef, env: NewsroomEnv) {
  return isLocalNewsroomDomain(env.newsroomDomain) ? appHostFrom(env.appUrl).replace(/:\d+$/, "") : `${account.slug}.${env.newsroomDomain}`;
}

/** The three ways to reach a newsroom, for the settings screen. */
export function previewUrls(account: NewsroomAccountRef, settings: NewsroomSettingsRef, env: NewsroomEnv) {
  const path = `${env.appUrl.replace(/\/+$/, "")}/n/${account.slug}`;
  const sub = isLocalNewsroomDomain(env.newsroomDomain)
    ? `http://${account.slug}.${env.newsroomDomain}${(appHostFrom(env.appUrl).match(/:\d+$/) ?? [""])[0]}`
    : `https://${account.slug}.${env.newsroomDomain}`;
  const custom = settings?.customDomain ? `https://${settings.customDomain}` : null;
  return { path, sub, custom };
}
