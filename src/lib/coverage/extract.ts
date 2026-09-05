/** Pure article metadata extraction from HTML. No DOM: regex over meta tags, JSON-LD and a few elements. */
export type ArticleMeta = {
  title: string | null;
  outlet: string | null;
  publishedAt: string | null; // ISO
  image: string | null;
  author: string | null;
  description: string | null;
  canonicalUrl: string;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" };

export function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function clean(s: string | null | undefined) {
  if (!s) return null;
  const t = decodeEntities(s).replace(/\s+/g, " ").trim();
  return t || null;
}

/** Parse the attributes of one tag string into a lowercase-keyed map. */
function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

function metaMap(html: string) {
  const map = new Map<string, string>();
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const a = attrs(m[0]);
    const key = (a.property ?? a.name ?? a.itemprop ?? "").toLowerCase();
    if (key && a.content !== undefined && !map.has(key)) map.set(key, a.content);
  }
  return map;
}

function jsonLd(html: string): any[] {
  const out: any[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const flat = (x: any) => { if (!x) return; if (Array.isArray(x)) x.forEach(flat); else if (typeof x === "object") { out.push(x); if (x["@graph"]) flat(x["@graph"]); } };
      flat(parsed);
    } catch { /* ignore malformed blocks */ }
  }
  return out;
}

const ARTICLE_TYPES = /article|newsarticle|blogposting|reportagenewsarticle|webpage|videoobject/i;

function ldArticle(blocks: any[]) {
  const typed = blocks.find((b) => ARTICLE_TYPES.test([].concat(b["@type"] ?? []).join(" ")));
  return typed ?? blocks.find((b) => b.headline || b.datePublished) ?? null;
}

function nameOf(x: any): string | null {
  if (!x) return null;
  if (typeof x === "string") return x;
  if (Array.isArray(x)) return x.map(nameOf).filter(Boolean).join(", ") || null;
  if (typeof x === "object") return x.name ?? nameOf(x.author) ?? null;
  return null;
}

function urlOf(x: any): string | null {
  if (!x) return null;
  if (typeof x === "string") return x;
  if (Array.isArray(x)) return urlOf(x[0]);
  if (typeof x === "object") return x.url ?? x.contentUrl ?? null;
  return null;
}

function toIso(s: string | null | undefined) {
  if (!s) return null;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function hostnameOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return ""; }
}

function absolute(href: string | null, base: string) {
  if (!href) return null;
  try { return new URL(href, base).toString(); } catch { return href; }
}

export function extractArticleMeta(html: string, url: string): ArticleMeta {
  const meta = metaMap(html);
  const ld = ldArticle(jsonLd(html));
  const get = (...keys: string[]) => { for (const k of keys) { const v = meta.get(k); if (v && v.trim()) return v; } return null; };

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  const title = clean(get("og:title", "twitter:title") ?? ld?.headline ?? ld?.name ?? titleTag);

  const outlet = clean(get("og:site_name", "application-name") ?? nameOf(ld?.publisher) ?? hostnameOf(url));

  const timeTag = html.match(/<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;
  const publishedAt = toIso(get("article:published_time", "og:article:published_time", "datepublished", "date", "pubdate", "publish-date", "dc.date.issued") ?? ld?.datePublished ?? ld?.dateCreated ?? timeTag);

  const image = absolute(clean(get("og:image", "og:image:url", "twitter:image") ?? urlOf(ld?.image) ?? urlOf(ld?.thumbnailUrl)), url);

  const author = clean(get("author", "article:author", "dc.creator", "parsely-author", "sailthru.author") ?? nameOf(ld?.author));

  const description = clean(get("og:description", "description", "twitter:description") ?? ld?.description);

  const canonicalTag = html.match(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/i)?.[0];
  const canonical = canonicalTag ? attrs(canonicalTag).href : null;
  const canonicalUrl = absolute(canonical ?? get("og:url") ?? ld?.url ?? ld?.mainEntityOfPage?.["@id"] ?? null, url) ?? url;

  return {
    title,
    outlet,
    publishedAt,
    image: image && /^https?:/i.test(image) ? image : null,
    author: author && /^https?:/i.test(author) ? null : author,
    description,
    canonicalUrl: /^https?:/i.test(canonicalUrl) ? canonicalUrl : url,
  };
}

/** Split "Jane Q. Doe" into first and last for contact matching. */
export function splitName(name: string) {
  const parts = name.replace(/\b(by|staff|reporter)\b/gi, "").replace(/[,|].*$/, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return { first: parts[0], last: parts.length > 1 ? parts[parts.length - 1] : "" };
}
