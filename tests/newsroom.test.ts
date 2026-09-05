import { describe, expect, it } from "vitest";
import { resolveHost } from "@/lib/newsroom/host";
import { buildRss, escapeXml } from "@/lib/newsroom/rss";
import { canonicalReleaseUrl, cnameTarget, newsroomBaseUrl } from "@/lib/newsroom/urls";
import { formatDateline, newsArticleJsonLd, renderArticleHtml } from "@/lib/newsroom/article";
import { fontStack, googleFontHref, normalizeSocials } from "@/lib/newsroom/theme";

describe("resolveHost", () => {
  const nd = "newsroom.example.com";
  it("treats the app host and localhost as the app", () => {
    expect(resolveHost("app.example.com", "app.example.com", nd)).toEqual({ kind: "app" });
    expect(resolveHost("localhost:3000", "localhost", nd)).toEqual({ kind: "app" });
    expect(resolveHost("127.0.0.1:3000", "localhost", nd)).toEqual({ kind: "app" });
    expect(resolveHost("", "localhost", nd)).toEqual({ kind: "app" });
    expect(resolveHost(nd, "localhost", nd)).toEqual({ kind: "app" });
  });
  it("extracts the slug from a newsroom subdomain, ignoring the port and case", () => {
    expect(resolveHost("Demo.newsroom.example.com:443", "app.example.com", nd)).toEqual({ kind: "subdomain", slug: "demo" });
    expect(resolveHost("demo.newsroom.localhost:3000", "localhost:3000", "newsroom.localhost")).toEqual({ kind: "subdomain", slug: "demo" });
    expect(resolveHost("a.b.newsroom.example.com", "app.example.com", nd)).toEqual({ kind: "subdomain", slug: "a" });
    expect(resolveHost("www.newsroom.example.com", "app.example.com", nd)).toEqual({ kind: "app" });
  });
  it("treats anything else as a custom domain", () => {
    expect(resolveHost("news.acme.com", "app.example.com", nd)).toEqual({ kind: "custom", host: "news.acme.com" });
    expect(resolveHost("news.acme.com:8443", "app.example.com", nd)).toEqual({ kind: "custom", host: "news.acme.com" });
  });
  it("rejects hosts with odd characters", () => {
    expect(resolveHost("bad host/x", "app.example.com", nd)).toEqual({ kind: "app" });
  });
});

describe("buildRss", () => {
  const channel = { title: "Acme & Co <Newsroom>", link: "https://acme.newsroom.example.com", description: 'Say "hi"', selfUrl: "https://acme.newsroom.example.com/feed.xml" };
  it("escapes XML special characters", () => {
    expect(escapeXml(`<a href="x">Tom & Jerry's</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;");
    const xml = buildRss([{ title: "5 < 6 & 7 > 3", link: "https://x/y?a=1&b=2", guid: "g1", pubDate: new Date("2026-01-02T03:04:05Z"), description: "desc <b>", categories: ["Health & Wellness"] }], channel);
    expect(xml).toContain("<title>Acme &amp; Co &lt;Newsroom&gt;</title>");
    expect(xml).toContain("<title>5 &lt; 6 &amp; 7 &gt; 3</title>");
    expect(xml).toContain("<link>https://x/y?a=1&amp;b=2</link>");
    expect(xml).toContain("<category>Health &amp; Wellness</category>");
    expect(xml).toContain("<pubDate>Fri, 02 Jan 2026 03:04:05 GMT</pubDate>");
    expect(xml).toContain('<atom:link href="https://acme.newsroom.example.com/feed.xml" rel="self"');
  });
  it("emits one item per release and wraps content in CDATA", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ title: `R${i}`, link: `https://x/${i}`, guid: `id${i}`, pubDate: new Date(), description: "d", contentHtml: "<p>body ]]> tail</p>" }));
    const xml = buildRss(items, channel);
    expect(xml.match(/<item>/g)).toHaveLength(7);
    expect(xml).toContain("<content:encoded><![CDATA[<p>body ]]]]><![CDATA[> tail</p>]]></content:encoded>");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
  it("handles an empty feed", () => {
    const xml = buildRss([], channel);
    expect(xml).not.toContain("<item>");
    expect(xml).toContain("</channel>");
  });
});

describe("canonicalReleaseUrl", () => {
  const account = { slug: "demo" };
  const release = { slug: "big-news" };
  it("prefers a verified custom domain", () => {
    expect(canonicalReleaseUrl(account, { customDomain: "News.Acme.com", domainVerifiedAt: new Date() }, release, { appUrl: "https://app.example.com", newsroomDomain: "newsroom.example.com" })).toBe("https://news.acme.com/big-news");
  });
  it("ignores an unverified custom domain and uses the newsroom subdomain", () => {
    expect(canonicalReleaseUrl(account, { customDomain: "news.acme.com", domainVerifiedAt: null }, release, { appUrl: "https://app.example.com", newsroomDomain: "newsroom.example.com" })).toBe("https://demo.newsroom.example.com/big-news");
  });
  it("falls back to the path form on the localhost default", () => {
    expect(canonicalReleaseUrl(account, null, release, { appUrl: "http://localhost:3000/", newsroomDomain: "newsroom.localhost" })).toBe("http://localhost:3000/n/demo/big-news");
    expect(newsroomBaseUrl(account, undefined, { appUrl: "http://localhost:3000", newsroomDomain: "" })).toBe("http://localhost:3000/n/demo");
  });
  it("computes the CNAME target", () => {
    expect(cnameTarget(account, { appUrl: "https://app.example.com", newsroomDomain: "newsroom.example.com" })).toBe("demo.newsroom.example.com");
    expect(cnameTarget(account, { appUrl: "http://localhost:3000", newsroomDomain: "newsroom.localhost" })).toBe("localhost");
  });
});

describe("article renderer", () => {
  it("strips scripts and event handlers but keeps formatting", () => {
    const html = renderArticleHtml({ headline: "H", body: `<p onclick="x()">Hello <strong>world</strong></p><script>alert(1)</script><img src="x" onerror="evil()">`, boilerplateHtml: "<p>About us<script>bad()</script></p>", mediaContactHtml: `<p><a href="javascript:alert(1)">Call</a> <a href="mailto:m@x.com">mail</a></p>` });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("<h2>About</h2>");
    expect(html).toContain("<h2>Media contact</h2>");
    expect(html).toContain('href="mailto:m@x.com"');
  });
  it("omits empty sections", () => {
    const html = renderArticleHtml({ headline: "H", body: "<p>x</p>", boilerplateHtml: "  ", mediaContactHtml: null });
    expect(html).not.toContain("About");
    expect(html).not.toContain("Media contact");
  });
  it("formats the dateline as CITY, Month D, YYYY", () => {
    expect(formatDateline("Toronto", new Date("2026-03-05T15:00:00Z"), "America/Toronto")).toBe("TORONTO, March 5, 2026");
    expect(formatDateline(null, new Date("2026-03-05T15:00:00Z"), "UTC")).toBe("March 5, 2026");
    expect(formatDateline("Ottawa", null)).toBe("OTTAWA");
  });
  it("builds NewsArticle JSON-LD", () => {
    const j = newsArticleJsonLd({ headline: "H", description: "D", url: "https://x/y", image: "https://x/i.jpg", datePublished: "2026-01-01T00:00:00Z", publisher: "Acme" });
    expect(j["@type"]).toBe("NewsArticle");
    expect(j.image).toEqual(["https://x/i.jpg"]);
    expect(j.datePublished).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("theme", () => {
  it("only loads Google Fonts for the allowed families", () => {
    expect(googleFontHref("Inter")).toContain("family=Inter");
    expect(googleFontHref("Source Sans 3")).toContain("Source+Sans+3");
    expect(googleFontHref("Georgia")).toBeNull();
    expect(googleFontHref("Comic Sans")).toBeNull();
    expect(fontStack("Georgia")).toContain("serif");
    expect(fontStack("Whatever")).toContain("system-ui");
  });
  it("keeps only http(s) socials", () => {
    expect(normalizeSocials({ x: "https://x.com/acme", linkedin: "javascript:alert(1)", bogus: "https://x" })).toEqual({ x: "https://x.com/acme" });
    expect(normalizeSocials(null)).toEqual({});
  });
});

describe("custom domain checks", async () => {
  const { domainMatches, normalizeDomain, describeRecords } = await import("@/lib/newsroom/domain");
  it("normalizes user input", () => {
    expect(normalizeDomain(" https://News.Acme.com/path ")).toBe("news.acme.com");
    expect(normalizeDomain("news.acme.com.")).toBe("news.acme.com");
  });
  it("accepts a CNAME to the target or matching A records", () => {
    expect(domainMatches({ cnames: ["demo.newsroom.example.com."], a: [] }, "demo.newsroom.example.com", [])).toBe(true);
    expect(domainMatches({ cnames: ["other.example.com"], a: ["1.2.3.4"] }, "demo.newsroom.example.com", ["1.2.3.4"])).toBe(false);
    expect(domainMatches({ cnames: [], a: ["1.2.3.4", "5.6.7.8"] }, "demo.newsroom.example.com", ["5.6.7.8"])).toBe(true);
    expect(domainMatches({ cnames: [], a: [] }, "demo.newsroom.example.com", ["5.6.7.8"])).toBe(false);
    expect(describeRecords({ cnames: [], a: [] })).toBe("no CNAME or A record");
  });
});
