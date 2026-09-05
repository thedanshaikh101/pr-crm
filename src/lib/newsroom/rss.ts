// RSS 2.0 builder for the newsroom feed. Pure; tested in tests/newsroom.test.ts.

export type RssItem = {
  title: string;
  link: string;
  guid: string;
  pubDate: Date;
  description: string;
  contentHtml?: string;
  categories?: string[];
};
export type RssChannel = { title: string; link: string; description: string; selfUrl?: string; language?: string; imageUrl?: string };

export function escapeXml(s: string) {
  return String(s ?? "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

function cdata(s: string) {
  return `<![CDATA[${String(s ?? "").replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

export function buildRss(items: RssItem[], channel: RssChannel) {
  const now = new Date().toUTCString();
  const body = items.map((it) => [
    "    <item>",
    `      <title>${escapeXml(it.title)}</title>`,
    `      <link>${escapeXml(it.link)}</link>`,
    `      <guid isPermaLink="false">${escapeXml(it.guid)}</guid>`,
    `      <pubDate>${new Date(it.pubDate).toUTCString()}</pubDate>`,
    `      <description>${escapeXml(it.description)}</description>`,
    ...(it.contentHtml ? [`      <content:encoded>${cdata(it.contentHtml)}</content:encoded>`] : []),
    ...(it.categories ?? []).map((c) => `      <category>${escapeXml(c)}</category>`),
    "    </item>",
  ].join("\n")).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(channel.link)}</link>`,
    `    <description>${escapeXml(channel.description)}</description>`,
    `    <language>${escapeXml(channel.language ?? "en")}</language>`,
    `    <lastBuildDate>${now}</lastBuildDate>`,
    ...(channel.selfUrl ? [`    <atom:link href="${escapeXml(channel.selfUrl)}" rel="self" type="application/rss+xml" />`] : []),
    ...(channel.imageUrl ? [`    <image><url>${escapeXml(channel.imageUrl)}</url><title>${escapeXml(channel.title)}</title><link>${escapeXml(channel.link)}</link></image>`] : []),
    body,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
