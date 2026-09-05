import { describe, expect, it } from "vitest";
import { cleanText, decodeEntities, parseFeed } from "@/lib/contacts/rss";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title><![CDATA[CBC | Top Stories News]]></title>
  <link>https://www.cbc.ca/news</link>
  <atom:link href="https://www.cbc.ca/webfeed/rss/rss-topstories" rel="self" type="application/rss+xml"/>
  <item>
    <title><![CDATA[Ottawa &amp; Gatineau brace for storm]]></title>
    <link>https://www.cbc.ca/news/canada/ottawa/storm-1.123</link>
    <guid isPermaLink="false">1.123</guid>
    <pubDate>Fri, 04 Sep 2026 13:05:00 EDT</pubDate>
    <description><![CDATA[<p>Not needed</p>]]></description>
  </item>
  <item>
    <title>Housing plan &#8220;on track&#8221; says minister</title>
    <link>
      https://www.cbc.ca/news/politics/housing-1.456
    </link>
    <dc:date>2026-09-03T10:00:00Z</dc:date>
  </item>
  <item><title>No link here</title></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">Global News</title>
  <link rel="self" href="https://globalnews.ca/feed/"/>
  <updated>2026-09-05T00:00:00Z</updated>
  <entry>
    <id>tag:globalnews.ca,2026:1</id>
    <title type="html">&lt;b&gt;Markets&lt;/b&gt; rally on rate cut</title>
    <link rel="enclosure" href="https://globalnews.ca/img.jpg" type="image/jpeg"/>
    <link rel="alternate" type="text/html" href="https://globalnews.ca/news/1/markets-rally/"/>
    <published>2026-09-04T18:30:00-04:00</published>
    <updated>2026-09-04T19:00:00-04:00</updated>
  </entry>
  <entry>
    <id>tag:globalnews.ca,2026:2</id>
    <title><![CDATA[Second story]]></title>
    <link href="https://globalnews.ca/news/2/second/"/>
    <updated>2026-09-02T08:00:00Z</updated>
  </entry>
</feed>`;

describe("rss: RSS 2.0", () => {
  const f = parseFeed(RSS);
  it("detects the kind and channel title through CDATA", () => { expect(f.kind).toBe("rss"); expect(f.title).toBe("CBC | Top Stories News"); });
  it("parses items with CDATA, entities, whitespace and dc:date", () => {
    expect(f.items).toHaveLength(3);
    expect(f.items[0]).toMatchObject({ title: "Ottawa & Gatineau brace for storm", link: "https://www.cbc.ca/news/canada/ottawa/storm-1.123", guid: "1.123" });
    expect(f.items[0].publishedAt?.toISOString()).toBe("2026-09-04T17:05:00.000Z");
    expect(f.items[1].title).toBe("Housing plan “on track” says minister");
    expect(f.items[1].link).toBe("https://www.cbc.ca/news/politics/housing-1.456");
    expect(f.items[1].publishedAt?.toISOString()).toBe("2026-09-03T10:00:00.000Z");
    expect(f.items[2]).toMatchObject({ title: "No link here", link: "", publishedAt: null });
  });
});

describe("rss: Atom", () => {
  const f = parseFeed(ATOM);
  it("detects Atom and prefers the alternate link", () => {
    expect(f.kind).toBe("atom"); expect(f.title).toBe("Global News");
    expect(f.items[0].link).toBe("https://globalnews.ca/news/1/markets-rally/");
    expect(f.items[0].title).toBe("Markets rally on rate cut");
    expect(f.items[0].publishedAt?.toISOString()).toBe("2026-09-04T22:30:00.000Z");
    expect(f.items[0].guid).toBe("tag:globalnews.ca,2026:1");
  });
  it("falls back to updated and bare href links", () => {
    expect(f.items[1]).toMatchObject({ title: "Second story", link: "https://globalnews.ca/news/2/second/" });
    expect(f.items[1].publishedAt?.toISOString()).toBe("2026-09-02T08:00:00.000Z");
  });
});

describe("rss: helpers", () => {
  it("decodes named, decimal and hex entities", () => { expect(decodeEntities("a &amp; b &#60;c&#x3e; &quot;d&quot; &unknown;")).toBe('a & b <c> "d" &unknown;'); });
  it("cleans CDATA and tags", () => { expect(cleanText("<![CDATA[ <em>Hi</em>  there ]]>")).toBe("Hi there"); expect(cleanText(null)).toBe(""); });
  it("survives garbage input", () => { expect(parseFeed("").items).toEqual([]); expect(parseFeed("<html><body>nope</body></html>").items).toEqual([]); });
});
