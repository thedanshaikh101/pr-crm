// Server-side loaders for the public newsroom. No session: the account comes from the slug
// (path or subdomain) or a verified custom domain. Everything is pinned to that accountId.
import * as React from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { NewsroomSettings, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { envFromProcess, newsroomBaseUrl } from "./urls";
import { normalizeSocials, type SocialKey } from "./theme";

export const RELEASES_PER_PAGE = 20;

// React.cache dedupes the layout + page lookups within one request. It only exists in the
// React build Next.js ships; fall back to the plain function when run from scripts.
const cache: <F extends (...a: any[]) => any>(fn: F) => F = (React as any).cache ?? ((fn: any) => fn);

export type Newsroom = {
  account: { id: string; name: string; slug: string; timezone: string };
  settings: NewsroomSettings;
  socials: Partial<Record<SocialKey, string>>;
  /** Prefix for in-site links: "/n/<slug>" on the app host, "" on a subdomain or custom domain. */
  base: string;
  /** Absolute URL of the newsroom root for canonical links, OG tags, RSS. */
  canonicalBase: string;
  print: boolean;
};

function finish(account: { id: string; name: string; slug: string; timezone: string; suspendedAt: Date | null; newsroom: NewsroomSettings | null }, base: string): Newsroom {
  const settings: NewsroomSettings = account.newsroom ?? {
    accountId: account.id, customDomain: null, domainVerifiedAt: null, logoUrl: null, headerImageUrl: null, primaryColor: "#1F5FBF", fontFamily: "Inter",
    footerHtml: null, mediaContactHtml: null, socials: {}, aboutHtml: null, mediaKitHtml: null, showSearch: true, showRss: true,
  };
  const h = headers();
  return {
    account: { id: account.id, name: account.name, slug: account.slug, timezone: account.timezone },
    settings,
    socials: normalizeSocials(settings.socials),
    base,
    canonicalBase: newsroomBaseUrl(account, settings, envFromProcess()),
    print: h.get("x-newsroom-print") === "1",
  };
}

/** Resolve by account slug. Base is "" when the middleware rewrote a subdomain request, else the path form. */
export const loadNewsroomBySlug = cache(async (slug: string): Promise<Newsroom> => {
  const account = await db.account.findUnique({ where: { slug }, include: { newsroom: true } });
  if (!account || account.suspendedAt) notFound();
  const base = headers().get("x-newsroom-base") ?? `/n/${slug}`;
  return finish(account, base);
});

/** Resolve by a verified custom domain (the `/n/_host/<host>` tree). */
export const loadNewsroomByHost = cache(async (host: string): Promise<Newsroom> => {
  const h = decodeURIComponent(host).toLowerCase().replace(/:\d+$/, "");
  const settings = await db.newsroomSettings.findUnique({ where: { customDomain: h }, include: { account: true } });
  if (!settings || !settings.domainVerifiedAt || settings.account.suspendedAt) notFound();
  const { account, ...rest } = settings;
  return finish({ ...account, newsroom: rest as NewsroomSettings }, "");
});

export function liveWhere(accountId: string, now = new Date()): Prisma.ReleaseWhereInput {
  return { accountId, status: "LIVE", deletedAt: null, OR: [{ embargoUntil: null }, { embargoUntil: { lte: now } }] };
}

export const releaseCardSelect = {
  id: true, slug: true, headline: true, subheadline: true, body: true, datelineCity: true, datelineDate: true, publishedAt: true, featuredImageUrl: true, kind: true,
  client: { select: { name: true } }, tags: { select: { tag: { select: { name: true } } } },
} satisfies Prisma.ReleaseSelect;

export type ReleaseCard = Prisma.ReleaseGetPayload<{ select: typeof releaseCardSelect }>;

export async function listReleases(accountId: string, opts: { q?: string; tag?: string; page?: number; per?: number }) {
  const per = opts.per ?? RELEASES_PER_PAGE;
  const page = Math.max(1, opts.page ?? 1);
  const and: Prisma.ReleaseWhereInput[] = [liveWhere(accountId)];
  const q = (opts.q ?? "").trim();
  if (q) and.push({ OR: [{ headline: { contains: q, mode: "insensitive" } }, { subheadline: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }] });
  const tag = (opts.tag ?? "").trim();
  if (tag) and.push({ tags: { some: { tag: { name: { equals: tag, mode: "insensitive" } } } } });
  const where: Prisma.ReleaseWhereInput = { AND: and };
  const [total, rows] = await Promise.all([
    db.release.count({ where }),
    db.release.findMany({ where, select: releaseCardSelect, orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], skip: (page - 1) * per, take: per }),
  ]);
  return { total, rows, page, per, pages: Math.max(1, Math.ceil(total / per)) };
}

export async function getLiveRelease(accountId: string, slug: string) {
  const r = await db.release.findFirst({
    where: { ...liveWhere(accountId), slug },
    include: {
      client: { select: { id: true, name: true } },
      tags: { select: { tag: { select: { name: true } } } },
      attachments: { include: { asset: true } },
    },
  });
  if (!r) return null;
  const at = r.publishedAt ?? r.createdAt;
  const [prev, next, boilerplate, mediaContact] = await Promise.all([
    db.release.findFirst({ where: { ...liveWhere(accountId), id: { not: r.id }, publishedAt: { lt: at } }, orderBy: { publishedAt: "desc" }, select: { slug: true, headline: true } }),
    db.release.findFirst({ where: { ...liveWhere(accountId), id: { not: r.id }, publishedAt: { gt: at } }, orderBy: { publishedAt: "asc" }, select: { slug: true, headline: true } }),
    r.boilerplateId ? db.boilerplate.findFirst({ where: { id: r.boilerplateId, accountId, kind: "BOILERPLATE" } }) : null,
    mediaContactFor(accountId, r.clientId),
  ]);
  return { release: r, prev, next, boilerplateHtml: boilerplate?.body ?? null, mediaContactHtml: mediaContact };
}

/** MEDIA_CONTACT boilerplate for the client, else the account default one, else the newsroom setting. */
export async function mediaContactFor(accountId: string, clientId: string | null) {
  const rows = await db.boilerplate.findMany({ where: { accountId, kind: "MEDIA_CONTACT", OR: [{ clientId: clientId ?? "__none__" }, { isDefault: true }, { clientId: null }] } });
  const pick = rows.find((b: any) => clientId && b.clientId === clientId) ?? rows.find((b: any) => b.isDefault) ?? null;
  if (pick) return pick.body as string;
  const s = await db.newsroomSettings.findUnique({ where: { accountId }, select: { mediaContactHtml: true } });
  return s?.mediaContactHtml ?? null;
}

export async function mediaKitAssets(accountId: string) {
  return db.asset.findMany({ where: { accountId, inMediaKit: true, deletedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
}

export async function tagsInUse(accountId: string) {
  const rows = await db.releaseTag.findMany({ where: { release: liveWhere(accountId) }, select: { tag: { select: { name: true } } } });
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.tag.name, (counts.get(r.tag.name) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}
