import { describe, expect, it } from "vitest";
import { activeFilterCount, buildCoverageWhere, dayBound, parseFilters, toQuery } from "@/lib/coverage/filters";
import { extractArticleMeta, splitName } from "@/lib/coverage/extract";
import { csvEscape, csvLine, coverageCsvRow, toCsv } from "@/lib/coverage/csv";
import { assertFetchableUrl } from "@/lib/coverage/fetch";

describe("coverage filters", () => {
  it("pins accountId and deletedAt as the first AND clause and top-level only", () => {
    const w = buildCoverageWhere(parseFilters({}), "acct_A");
    expect(w.AND[0]).toEqual({ accountId: "acct_A", deletedAt: null });
    expect(w.AND[1]).toEqual({ parentId: null });
  });
  it("cannot be overridden by URL params", () => {
    const w = buildCoverageWhere(parseFilters({ accountId: "acct_B", client: "c1" } as any), "acct_A");
    expect(JSON.stringify(w)).not.toContain("acct_B");
    expect(w.AND[0].accountId).toBe("acct_A");
  });
  it("round-trips filters through the query string and counts them", () => {
    const f = parseFilters({ type: "ONLINE,PRINT", sentiment: "POSITIVE", from: "2026-01-01", hasUrl: "true", page: "3", sort: "reach", clientId: "c1" });
    expect(f.type).toEqual(["ONLINE", "PRINT"]);
    expect(f.client).toEqual(["c1"]);
    expect(activeFilterCount(f)).toBe(5);
    const q = toQuery(f);
    expect(q).toContain("type=ONLINE%2CPRINT");
    expect(q).toContain("page=3");
    expect(q).toContain("sort=reach");
    expect(q).toContain("hasUrl=true");
    expect(parseFilters(Object.fromEntries(new URLSearchParams(q))).type).toEqual(["ONLINE", "PRINT"]);
  });
  it("falls back to defaults on bad input", () => {
    const f = parseFilters({ per: "7", from: "yesterday" });
    expect(f.per).toBe(50);
    expect(f.from).toBeUndefined();
  });
  it("applies date bounds inclusively and searches headline, outlet and summary", () => {
    const w = buildCoverageWhere(parseFilters({ from: "2026-02-01", to: "2026-02-28", q: "clinic" }), "a");
    const s = JSON.stringify(w);
    expect(s).toContain("2026-02-01T00:00:00.000Z");
    expect(s).toContain("2026-02-28T23:59:59.999Z");
    const or = w.AND.find((x: any) => x.OR);
    expect(or.OR.map((x: any) => Object.keys(x)[0])).toEqual(["headline", "outletName", "summary"]);
    expect(dayBound("2026-03-05").toISOString()).toBe("2026-03-05T00:00:00.000Z");
  });
});

const OG_PAGE = `<!doctype html><html><head>
<title>Fallback title | CBC</title>
<meta property="og:title" content="Toronto clinic opens its doors &amp; welcomes patients" />
<meta property="og:site_name" content="CBC News">
<meta property="og:description" content="A new accessible clinic opened Monday.">
<meta property="og:image" content="/images/clinic.jpg">
<meta property="article:published_time" content="2026-03-02T14:30:00-05:00">
<meta name="author" content="Jane Q. Doe">
<link rel="canonical" href="https://www.cbc.ca/news/toronto/clinic-1.234">
</head><body><time datetime="2020-01-01">ignored</time></body></html>`;

const LD_ONLY_PAGE = `<html><head><title>Global News</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Global News"},{"@type":"NewsArticle","headline":"Study links workplace programs to fewer sick days","datePublished":"2026-04-10T09:00:00Z","author":[{"@type":"Person","name":"Sam Reporter"}],"image":{"@type":"ImageObject","url":"https://globalnews.ca/img/study.png"},"publisher":{"@type":"Organization","name":"Global News"},"description":"Researchers followed 2,000 workers.","mainEntityOfPage":{"@id":"https://globalnews.ca/news/123/study"}}]}
</script></head><body><h1>Study</h1></body></html>`;

const BARE_PAGE = `<html><head><title>  Bare   page &#8211; Example Outlet </title><meta name="description" content="Just a description"></head>
<body><article><time datetime="2026-05-20T08:00:00Z">May 20</time><p>Body</p></article></body></html>`;

describe("extractArticleMeta", () => {
  it("prefers Open Graph tags and resolves relative images", () => {
    const m = extractArticleMeta(OG_PAGE, "https://www.cbc.ca/news/toronto/clinic-1.234?utm=x");
    expect(m.title).toBe("Toronto clinic opens its doors & welcomes patients");
    expect(m.outlet).toBe("CBC News");
    expect(m.description).toBe("A new accessible clinic opened Monday.");
    expect(m.image).toBe("https://www.cbc.ca/images/clinic.jpg");
    expect(m.publishedAt).toBe("2026-03-02T19:30:00.000Z");
    expect(m.author).toBe("Jane Q. Doe");
    expect(m.canonicalUrl).toBe("https://www.cbc.ca/news/toronto/clinic-1.234");
  });
  it("reads a JSON-LD only page", () => {
    const m = extractArticleMeta(LD_ONLY_PAGE, "https://globalnews.ca/news/123/study");
    expect(m.title).toBe("Study links workplace programs to fewer sick days");
    expect(m.outlet).toBe("Global News");
    expect(m.publishedAt).toBe("2026-04-10T09:00:00.000Z");
    expect(m.author).toBe("Sam Reporter");
    expect(m.image).toBe("https://globalnews.ca/img/study.png");
    expect(m.description).toBe("Researchers followed 2,000 workers.");
    expect(m.canonicalUrl).toBe("https://globalnews.ca/news/123/study");
  });
  it("falls back to title, hostname and <time datetime>", () => {
    const m = extractArticleMeta(BARE_PAGE, "https://www.example-outlet.com/story");
    expect(m.title).toBe("Bare page – Example Outlet");
    expect(m.outlet).toBe("example-outlet.com");
    expect(m.publishedAt).toBe("2026-05-20T08:00:00.000Z");
    expect(m.author).toBeNull();
    expect(m.image).toBeNull();
    expect(m.description).toBe("Just a description");
    expect(m.canonicalUrl).toBe("https://www.example-outlet.com/story");
  });
  it("splits author names for contact matching", () => {
    expect(splitName("By Jane Q. Doe, Staff")).toEqual({ first: "Jane", last: "Doe" });
    expect(splitName("Madonna")).toEqual({ first: "Madonna", last: "" });
  });
});

describe("fetch guard", () => {
  it("accepts public http(s) and rejects local or non-http targets", () => {
    expect(assertFetchableUrl("https://www.cbc.ca/news")).toBe("https://www.cbc.ca/news");
    expect(() => assertFetchableUrl("ftp://example.com")).toThrow();
    expect(() => assertFetchableUrl("http://localhost:3000/x")).toThrow();
    expect(() => assertFetchableUrl("http://192.168.1.4/")).toThrow();
    expect(() => assertFetchableUrl("not a url")).toThrow();
  });
});

describe("CSV", () => {
  it("escapes quotes, commas and newlines", () => {
    expect(csvEscape('He said "hi", then\nleft')).toBe('"He said ""hi"", then\nleft"');
    expect(csvEscape(null)).toBe('""');
    expect(csvLine(["a", 1, null])).toBe('"a","1",""');
    expect(toCsv(["x"], [["y"]])).toBe('"x"\n"y"\n');
  });
  it("formats a coverage row with tags and decimals", () => {
    const line = coverageCsvRow({ outletName: "CBC", headline: "H, with comma", url: null, publishedAt: new Date("2026-01-02T12:00:00Z"), type: "ONLINE", focus: "LOCAL", sentiment: "POSITIVE", client: { name: "Acme" }, release: null, estimatedReach: 1200, adValue: "45.50", pickupCount: 2, tags: [{ tag: { name: "Health" } }, { tag: { name: "Q1" } }], summary: null });
    expect(line).toBe('"CBC","H, with comma","","2026-01-02","ONLINE","LOCAL","POSITIVE","Acme","","1200","45.5","2","Health; Q1",""');
  });
});
