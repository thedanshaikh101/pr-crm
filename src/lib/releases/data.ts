// Server-side helpers shared by pages, server actions, and the sends worker. Not pure (uses the DB).
import { db } from "@/lib/db";
import { excerpt } from "@/lib/html";
import { parseBlocks, renderBlocks, type Block } from "./blocks";
import type { RenderInput } from "./render";
import { slugBase } from "./slug";

export const APP_URL = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const newsroomUrl = (accountSlug: string, releaseSlug: string) => `${APP_URL()}/n/${accountSlug}/${releaseSlug}`;
export const shortUrl = (shortCode: string) => `${APP_URL()}/r/${shortCode}`;

export type Kind = "PRESS_RELEASE" | "NEWSLETTER";
export const basePath = (kind: Kind) => (kind === "NEWSLETTER" ? "/newsletters" : "/releases");
export const kindLabel = (kind: Kind, plural = false) => (kind === "NEWSLETTER" ? (plural ? "Newsletters" : "Newsletter") : plural ? "Press releases" : "Press release");

export { slugBase };

/** Unique per account: base, base-2, base-3 ... */
export async function uniqueSlug(accountId: string, base: string, excludeId?: string) {
  const b = slugBase(base);
  const taken = await db.release.findMany({ where: { accountId, slug: { startsWith: b }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { slug: true } });
  const set = new Set(taken.map((x: any) => x.slug));
  if (!set.has(b)) return b;
  for (let n = 2; ; n++) if (!set.has(`${b}-${n}`)) return `${b}-${n}`;
}

/** Media contact id: the Release.mediaContactId column, with a fallback to rows saved before the column existed ({ mediaContactId } in blocks). */
export function readMediaContactId(r: { mediaContactId?: string | null; blocks?: unknown } | null | undefined): string | null {
  if (!r) return null;
  if (r.mediaContactId) return r.mediaContactId;
  const blocks = r.blocks;
  if (blocks && typeof blocks === "object" && !Array.isArray(blocks)) return ((blocks as any).mediaContactId as string) ?? null;
  return null;
}
export function blocksColumnFor(kind: Kind, blocks: Block[], _mediaContactId: string | null) {
  return kind === "NEWSLETTER" ? blocks : null;
}

export const RELEASE_INCLUDE = {
  client: { select: { id: true, name: true, color: true } },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
  attachments: { include: { asset: { select: { id: true, name: true, storageKey: true, externalUrl: true, kind: true, publicToken: true } } } },
} as const;

/** Everything renderReleaseHtml needs for a stored release, with boilerplate rows resolved. */
export async function buildRenderInput(accountId: string, r: any): Promise<RenderInput> {
  const mediaContactId = readMediaContactId(r);
  const ids = [r.boilerplateId, r.footerId, mediaContactId].filter(Boolean) as string[];
  const rows = ids.length ? await db.boilerplate.findMany({ where: { accountId, id: { in: ids } } }) : [];
  const byId = (id: string | null) => rows.find((x: any) => x.id === id)?.body ?? null;
  const attachments = await attachmentLinks(r.attachments ?? []);
  let body = r.body ?? "";
  if (r.kind === "NEWSLETTER") {
    const blocks = parseBlocks(r.blocks);
    body = renderBlocks(blocks, { releases: await blockReleaseContext(accountId, blocks) });
  }
  return {
    headline: r.headline, subheadline: r.subheadline, datelineCity: r.datelineCity, datelineDate: r.datelineDate, body,
    featuredImageUrl: r.featuredImageUrl, boilerplate: byId(r.boilerplateId), footer: byId(r.footerId), mediaContact: byId(mediaContactId), attachments,
  };
}

export async function blockReleaseContext(accountId: string, blocks: Block[]) {
  const ids = blocks.filter((b): b is Extract<Block, { type: "release" }> => b.type === "release").map((b) => b.releaseId);
  if (!ids.length) return {};
  const account = await db.account.findUnique({ where: { id: accountId }, select: { slug: true } });
  const rels = await db.release.findMany({ where: { accountId, id: { in: ids }, status: "LIVE", deletedAt: null }, select: { id: true, headline: true, subheadline: true, body: true, slug: true, featuredImageUrl: true } });
  const out: Record<string, { headline: string; subheadline?: string | null; body?: string | null; url: string; featuredImageUrl?: string | null }> = {};
  for (const x of rels) out[x.id] = { headline: x.headline, subheadline: x.subheadline, body: x.body, url: newsroomUrl(account?.slug ?? "", x.slug), featuredImageUrl: x.featuredImageUrl };
  return out;
}

export async function attachmentLinks(rows: { asset: { name: string; storageKey: string | null; externalUrl: string | null; publicToken: string } }[]) {
  const out: { name: string; url: string }[] = [];
  for (const a of rows) {
    const url = a.asset.externalUrl ?? (a.asset.storageKey ? `${APP_URL()}/api/storage/get?key=${encodeURIComponent(a.asset.storageKey)}` : null);
    if (url) out.push({ name: a.asset.name, url });
  }
  return out;
}

export function snapshotOf(r: any) {
  return {
    headline: r.headline, subheadline: r.subheadline, datelineCity: r.datelineCity, datelineDate: r.datelineDate, body: r.body, blocks: r.blocks,
    boilerplateId: r.boilerplateId, footerId: r.footerId, mediaContactId: r.mediaContactId ?? null, featuredImageUrl: r.featuredImageUrl, embargoUntil: r.embargoUntil, slug: r.slug, clientId: r.clientId, proactivity: r.proactivity,
    tagIds: (r.tags ?? []).map((t: any) => t.tagId), assetIds: (r.attachments ?? []).map((a: any) => a.assetId),
  };
}

export function releaseExcerpt(r: { kind: string; body: string; blocks: unknown }, n = 160) {
  if (r.kind === "NEWSLETTER") {
    const b = parseBlocks(r.blocks);
    const t = b.find((x) => x.type === "text") as Extract<Block, { type: "text" }> | undefined;
    return excerpt(t?.html ?? "", n);
  }
  return excerpt(r.body ?? "", n);
}

/** Per-distribution counters used by the list tiles and detail stats. */
export type RecipientStats = { sent: number; delivered: number; opened: number; clicked: number; replied: number; bounced: number; unsubscribed: number };
export async function statsByRelease(releaseIds: string[]): Promise<Record<string, RecipientStats>> {
  const out: Record<string, RecipientStats> = {};
  if (!releaseIds.length) return out;
  const dists = await db.distribution.findMany({ where: { releaseId: { in: releaseIds }, isTest: false }, select: { id: true, releaseId: true } });
  if (!dists.length) return out;
  const groups = await db.distributionRecipient.groupBy({
    by: ["distributionId"], where: { distributionId: { in: dists.map((d: any) => d.id) } },
    _count: { _all: true, deliveredAt: true, firstOpenAt: true, repliedAt: true, bouncedAt: true, unsubscribedAt: true }, _sum: { clickCount: true },
  });
  for (const g of groups as any[]) {
    const rid = dists.find((d: any) => d.id === g.distributionId)!.releaseId;
    const s = (out[rid] ??= { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, unsubscribed: 0 });
    s.sent += g._count._all; s.delivered += g._count.deliveredAt; s.opened += g._count.firstOpenAt; s.replied += g._count.repliedAt; s.bounced += g._count.bouncedAt; s.unsubscribed += g._count.unsubscribedAt; s.clicked += g._sum.clickCount ?? 0;
  }
  return out;
}

export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export type Who = "all" | "openers" | "non-openers" | "clickers" | "repliers" | "bounced";
export const WHO_LABEL: Record<Who, string> = { all: "recipients", openers: "openers", "non-openers": "non-openers", clickers: "clickers", repliers: "repliers", bounced: "bounced" };
export const WHO_KEYS = Object.keys(WHO_LABEL) as Who[];

export function recipientWhereFor(who: Who): any {
  switch (who) {
    case "openers": return { firstOpenAt: { not: null } };
    case "non-openers": return { firstOpenAt: null, deliveredAt: { not: null } };
    case "clickers": return { clickCount: { gt: 0 } };
    case "repliers": return { repliedAt: { not: null } };
    case "bounced": return { OR: [{ bouncedAt: { not: null } }, { droppedAt: { not: null } }, { blockedAt: { not: null } }] };
    default: return {};
  }
}
