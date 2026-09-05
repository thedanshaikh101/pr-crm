"use server";
// Newsroom settings: theme, content blocks, socials, custom domain verification. ADMIN for writes.
import { promises as dns } from "dns";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireRole, requireViewer } from "@/lib/auth";
import { cleanHtml } from "@/lib/html";
import { NEWSROOM_FONTS, SOCIAL_KEYS, safeColor } from "@/lib/newsroom/theme";
import { appHostFrom, cnameTarget, envFromProcess } from "@/lib/newsroom/urls";
import { DOMAIN_RE, describeRecords, domainMatches, normalizeDomain } from "@/lib/newsroom/domain";

const Url = z.string().trim().max(2000).refine((s) => !s || /^https?:\/\//i.test(s) || s.startsWith("/"), "Must be an http(s) URL").transform((s) => s || null);

export async function updateNewsroomSettings(form: FormData) {
  const v = await requireViewer(); requireRole(v, "ADMIN");
  const socials: Record<string, string> = {};
  for (const k of SOCIAL_KEYS) { const val = String(form.get(`social_${k}`) ?? "").trim(); if (val) socials[k] = Url.parse(val) ?? ""; }
  const font = String(form.get("fontFamily") ?? "Inter");
  const data = {
    logoUrl: Url.parse(form.get("logoUrl") ?? ""),
    headerImageUrl: Url.parse(form.get("headerImageUrl") ?? ""),
    primaryColor: safeColor(String(form.get("primaryColor") ?? "")),
    fontFamily: (NEWSROOM_FONTS as readonly string[]).includes(font) ? font : "Inter",
    footerHtml: cleanHtml(String(form.get("footerHtml") ?? "")) || null,
    mediaContactHtml: cleanHtml(String(form.get("mediaContactHtml") ?? "")) || null,
    aboutHtml: cleanHtml(String(form.get("aboutHtml") ?? "")) || null,
    mediaKitHtml: cleanHtml(String(form.get("mediaKitHtml") ?? "")) || null,
    socials,
    showSearch: form.get("showSearch") === "on",
    showRss: form.get("showRss") === "on",
  };
  await db.newsroomSettings.upsert({ where: { accountId: v.account.id }, create: { accountId: v.account.id, ...data }, update: data });
  await audit(v.account.id, v.user.id, "newsroom.update", "newsroom", v.account.id, { fields: Object.keys(data) });
  revalidatePath("/settings/newsroom");
  redirect("/settings/newsroom?saved=1");
}

function fail(msg: string): never {
  redirect(`/settings/newsroom?domain=error&found=${encodeURIComponent(msg)}#domain`);
}

export async function saveCustomDomain(form: FormData) {
  const v = await requireViewer(); requireRole(v, "ADMIN");
  const domain = normalizeDomain(String(form.get("customDomain") ?? ""));
  if (!domain) return removeCustomDomain();
  if (domain.length > 253 || !DOMAIN_RE.test(domain)) fail("Enter a hostname like news.example.com");
  const env = envFromProcess();
  if (domain === appHostFrom(env.appUrl).replace(/:\d+$/, "") || domain.endsWith(`.${env.newsroomDomain}`)) fail("That hostname is already served by the platform");
  const taken = await db.newsroomSettings.findFirst({ where: { customDomain: domain, NOT: { accountId: v.account.id } }, select: { accountId: true } });
  if (taken) fail("That domain is in use by another workspace");
  const cur = await db.newsroomSettings.findUnique({ where: { accountId: v.account.id }, select: { customDomain: true } });
  const changed = cur?.customDomain !== domain;
  await db.newsroomSettings.upsert({ where: { accountId: v.account.id }, create: { accountId: v.account.id, customDomain: domain }, update: { customDomain: domain, ...(changed ? { domainVerifiedAt: null } : {}) } });
  await audit(v.account.id, v.user.id, "newsroom.domain_set", "newsroom", v.account.id, { domain });
  revalidatePath("/settings/newsroom");
  redirect("/settings/newsroom?domain=saved#domain");
}

export async function removeCustomDomain() {
  const v = await requireViewer(); requireRole(v, "ADMIN");
  await db.newsroomSettings.updateMany({ where: { accountId: v.account.id }, data: { customDomain: null, domainVerifiedAt: null } });
  await audit(v.account.id, v.user.id, "newsroom.domain_remove", "newsroom", v.account.id);
  revalidatePath("/settings/newsroom");
  redirect("/settings/newsroom?domain=removed#domain");
}

export async function verifyCustomDomain() {
  const v = await requireViewer(); requireRole(v, "ADMIN");
  const s = await db.newsroomSettings.findUnique({ where: { accountId: v.account.id }, select: { customDomain: true } });
  if (!s?.customDomain) redirect("/settings/newsroom?domain=missing#domain");
  const env = envFromProcess();
  const target = cnameTarget(v.account, env);
  const appHost = appHostFrom(env.appUrl).replace(/:\d+$/, "");
  const cnames = await dns.resolveCname(s.customDomain).catch(() => [] as string[]);
  const a = cnames.length ? [] : await dns.resolve4(s.customDomain).catch(() => [] as string[]);
  const appA = a.length ? await dns.resolve4(appHost).catch(() => [] as string[]) : [];
  const ok = domainMatches({ cnames, a }, target, appA);
  await db.newsroomSettings.updateMany({ where: { accountId: v.account.id }, data: { domainVerifiedAt: ok ? new Date() : null } });
  await audit(v.account.id, v.user.id, ok ? "newsroom.domain_verified" : "newsroom.domain_verify_failed", "newsroom", v.account.id, { cnames, a });
  revalidatePath("/settings/newsroom");
  if (ok) redirect("/settings/newsroom?domain=verified#domain");
  redirect(`/settings/newsroom?domain=failed&found=${encodeURIComponent(describeRecords({ cnames, a }))}&target=${encodeURIComponent(target)}#domain`);
}
