// RSS route body for both route trees.
import { cleanHtml } from "@/lib/html";
import { articleExcerpt } from "./article";
import { buildRss } from "./rss";
import type { Newsroom } from "./data";
import { listReleases } from "./data";

export async function feedResponse(nr: Newsroom) {
  if (!nr.settings.showRss) return new Response("Not found", { status: 404 });
  const { rows } = await listReleases(nr.account.id, { per: 50 });
  const xml = buildRss(rows.map((r) => ({
    title: r.headline,
    link: `${nr.canonicalBase}/${r.slug}`,
    guid: `release:${r.id}`,
    pubDate: r.publishedAt ?? new Date(),
    description: r.subheadline || articleExcerpt(r.body, 200),
    contentHtml: cleanHtml(r.body),
    categories: r.tags.map((t) => t.tag.name),
  })), { title: `${nr.account.name} newsroom`, link: nr.canonicalBase, description: `Press releases and news from ${nr.account.name}`, selfUrl: `${nr.canonicalBase}/feed.xml`, imageUrl: nr.settings.logoUrl ?? undefined });
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300" } });
}
