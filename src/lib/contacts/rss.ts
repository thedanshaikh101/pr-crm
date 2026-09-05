// Tolerant RSS 2.0 / Atom parser using regexes, no DOM. Handles CDATA, entities, and namespaced dates.

export type FeedItem = { title: string; link: string; publishedAt: Date | null; guid: string | null };
export type Feed = { kind: "rss" | "atom"; title: string | null; items: FeedItem[] };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}
function safeChar(code: number) { try { return String.fromCodePoint(code); } catch { return ""; } }

/** Unwrap CDATA, decode entities, strip any leftover tags, collapse whitespace. */
export function cleanText(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  s = decodeEntities(s);
  s = s.replace(/<[^>]+>/g, "");
  return s.replace(/\s+/g, " ").trim();
}

/** Inner text of the first <tag> in the block; supports namespaced tags via the pattern given. */
function tagText(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}\\s*>`, "i");
  const m = block.match(re);
  return m ? m[1] : null;
}

function attr(tagHtml: string, name: string): string | null {
  const m = tagHtml.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const t = cleanText(s);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Atom links: prefer rel="alternate" (or no rel), then any href. */
function atomLink(block: string): string {
  const links = block.match(/<link\b[^>]*\/?>/gi) ?? [];
  let fallback = "";
  for (const l of links) {
    const href = attr(l, "href");
    if (!href) continue;
    const rel = (attr(l, "rel") ?? "alternate").toLowerCase();
    if (rel === "alternate") return cleanText(href);
    if (!fallback) fallback = cleanText(href);
  }
  return fallback;
}

function rssLink(block: string): string {
  const text = tagText(block, "link");
  if (text && cleanText(text)) return cleanText(text);
  // Some feeds emit <link href="..."/> even in RSS.
  const tag = block.match(/<link\b[^>]*\/?>/i)?.[0];
  const href = tag ? attr(tag, "href") : null;
  if (href) return cleanText(href);
  const guid = tagText(block, "guid");
  return guid && /^https?:\/\//i.test(cleanText(guid)) ? cleanText(guid) : "";
}

export function parseFeed(xml: string): Feed {
  const src = (xml ?? "").replace(/^﻿/, "");
  const isAtom = /<feed[\s>]/i.test(src) && !/<rss[\s>]/i.test(src);
  const items: FeedItem[] = [];
  if (isAtom) {
    const head = src.split(/<entry[\s>]/i)[0] ?? "";
    const title = cleanText(tagText(head, "title")) || null;
    for (const m of src.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry\s*>/gi)) {
      const b = m[1];
      const link = atomLink(b);
      const t = cleanText(tagText(b, "title"));
      if (!link && !t) continue;
      items.push({
        title: t || link,
        link,
        publishedAt: parseDate(tagText(b, "published")) ?? parseDate(tagText(b, "updated")) ?? parseDate(tagText(b, "dc:date")),
        guid: cleanText(tagText(b, "id")) || null,
      });
    }
    return { kind: "atom", title, items };
  }
  const head = src.split(/<item[\s>]/i)[0] ?? "";
  const chanTitle = cleanText(tagText(head, "title")) || null;
  for (const m of src.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/gi)) {
    const b = m[1];
    const link = rssLink(b);
    const t = cleanText(tagText(b, "title"));
    if (!link && !t) continue;
    items.push({
      title: t || link,
      link,
      publishedAt: parseDate(tagText(b, "pubDate")) ?? parseDate(tagText(b, "dc:date")) ?? parseDate(tagText(b, "published")) ?? parseDate(tagText(b, "updated")),
      guid: cleanText(tagText(b, "guid")) || null,
    });
  }
  return { kind: "rss", title: chanTitle, items };
}
