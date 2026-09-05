import { describe, expect, it } from "vitest";
import { renderReleaseHtml, renderNewsroomArticle, rewriteLinks, personalise, mergeVarsFor } from "@/lib/releases/render";
import { analyzeRelease, wordCount, HEADLINE_MAX } from "@/lib/releases/analyze";
import { renderBlocks, parseBlocks } from "@/lib/releases/blocks";
import { buildReleaseWhere, parseReleaseFilters, toReleaseQuery, activeReleaseFilterCount } from "@/lib/releases/filters";

const input = {
  headline: "Lumen opens clinic", subheadline: "First of its kind", datelineCity: "Toronto", datelineDate: new Date("2026-03-02T12:00:00Z"),
  body: "<p>Body text with <a href=\"https://example.com/a?x=1&y=2\">a link</a>.</p><script>alert(1)</script>",
  featuredImageUrl: "https://img.example/x.jpg", boilerplate: "<p>About Lumen</p>", footer: "<p>Footer</p>", mediaContact: "<p>Jane, 555-1234</p>",
  attachments: [{ name: "Fact sheet.pdf", url: "https://files.example/f.pdf" }],
};

describe("renderReleaseHtml", () => {
  it("email mode is a full 600px table document with intro, body, boilerplate, contact, footer, unsubscribe, pixel last", () => {
    const html = renderReleaseHtml(input, { mode: "email", wrapper: { intro: "<p>Hi {{first_name|there}}</p>" }, unsubscribeUrl: "https://app/u/r1", trackingPixelUrl: "https://app/o/r1", accountName: "Northstar" });
    expect(html.startsWith("<!DOCTYPE")).toBe(true);
    expect(html).toContain('width="600"');
    expect(html).not.toMatch(/display:\s*(flex|grid)/);
    expect(html).not.toContain("<script");
    const order = ["pd-intro", "<h1", "TORONTO, March 2, 2026", "About Lumen", "Jane, 555-1234", "Fact sheet.pdf", "pd-footer", "Unsubscribe", "https://app/o/r1"].map((s) => html.indexOf(s));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.lastIndexOf("<img")).toBeGreaterThan(html.indexOf("Unsubscribe"));
  });
  it("teaser mode links to the newsroom and omits the body", () => {
    const html = renderReleaseHtml(input, { mode: "email", wrapper: { intro: "<p>Intro</p>", teaserMode: true, newsroomUrl: "https://news/n/demo/lumen" } });
    expect(html).toContain("Read the full release");
    expect(html).toContain("https://news/n/demo/lumen");
    expect(html).toContain("First of its kind");
    expect(html).not.toContain("Body text with");
  });
  it("newsroom mode is a clean fragment", () => {
    const html = renderReleaseHtml(input, { mode: "newsroom" });
    expect(html.startsWith("<article")).toBe(true);
    expect(html).not.toContain("<html");
    expect(renderNewsroomArticle(input)).toBe(html);
  });
  it("print mode has print css", () => {
    expect(renderReleaseHtml(input, { mode: "print" })).toContain("@media print");
  });
});

describe("rewriteLinks and personalise", () => {
  it("rewrites every http(s) href and counts them", () => {
    const { html, count } = rewriteLinks('<a href="https://a.com/x?a=1&amp;b=2">A</a> <a href="mailto:x@y.z">m</a> <a href=\'http://b.com\'>B</a>', (u) => `https://t/${encodeURIComponent(u)}`);
    expect(count).toBe(2);
    expect(html).toContain("https://t/https%3A%2F%2Fa.com%2Fx%3Fa%3D1%26b%3D2");
    expect(html).toContain('href="mailto:x@y.z"');
  });
  it("personalises with fallbacks", () => {
    expect(personalise("<p>Hi {{first_name|there}} at {{outlet}}</p>", mergeVarsFor({ firstName: "", outlet: "CBC" }))).toBe("<p>Hi there at CBC</p>");
    expect(mergeVarsFor({ name: "Ada Lovelace" }).last_name).toBe("Lovelace");
  });
});

describe("analyzeRelease", () => {
  it("reports words, headline length, and presence badges", () => {
    const b = analyzeRelease({ headline: "x".repeat(HEADLINE_MAX + 1), body: "<p>one two three</p>", featuredImageUrl: null, boilerplateId: "b", mediaContactId: null, embargoUntil: null });
    const k = Object.fromEntries(b.map((x) => [x.key, x]));
    expect(wordCount("<p>one two three</p>")).toBe(3);
    expect(k.words.label).toBe("3 words");
    expect(k.headline.ok).toBe(false);
    expect(k.headline.level).toBe("warn");
    expect(k.boilerplate.ok).toBe(true);
    expect(k.mediaContact.ok).toBe(false);
    expect(k.image.ok).toBe(false);
    expect(k.embargo.level).toBe("neutral");
  });
});

describe("blocks", () => {
  it("renders email-safe html for each block type", () => {
    const blocks = parseBlocks([
      { id: "1", type: "heading", text: "Hello <b>", level: 2 }, { id: "2", type: "text", html: "<p>Para<script>x</script></p>" },
      { id: "3", type: "image", url: "https://i/x.png", alt: "pic", href: "https://l" }, { id: "4", type: "release", releaseId: "r1" },
      { id: "5", type: "button", label: "Go", href: "https://go" }, { id: "6", type: "divider" }, { id: "7", type: "bogus" },
    ]);
    expect(blocks).toHaveLength(6);
    const html = renderBlocks(blocks, { releases: { r1: { headline: "R1", body: "<p>Some body</p>", url: "https://n/r1" } } });
    expect(html).toContain("Hello &lt;b&gt;");
    expect(html).not.toContain("<script");
    expect(html).toContain('src="https://i/x.png"');
    expect(html).toContain("R1");
    expect(html).toContain("Read the full release");
    expect(html).toContain("https://go");
    expect(html).toContain("<hr");
    expect(html).not.toMatch(/display:\s*(flex|grid)/);
  });
  it("marks missing releases without throwing", () => {
    expect(renderBlocks([{ id: "a", type: "release", releaseId: "nope" }], { releases: {} })).toContain("not available");
  });
});

describe("release filters", () => {
  it("pins accountId and kind first and ignores URL accountId", () => {
    const w = buildReleaseWhere(parseReleaseFilters({ accountId: "acct_B", status: "LIVE,DRAFT" } as any), "acct_A", "PRESS_RELEASE");
    expect(w.AND[0]).toEqual({ accountId: "acct_A", kind: "PRESS_RELEASE", deletedAt: null });
    expect(JSON.stringify(w)).not.toContain("acct_B");
    expect(w.AND[1]).toEqual({ status: { in: ["LIVE", "DRAFT"] } });
  });
  it("round-trips query state", () => {
    const f = parseReleaseFilters({ client: "c1", tag: "t1,t2", view: "table", page: "3", q: "clinic" });
    expect(activeReleaseFilterCount(f)).toBe(2);
    const q = toReleaseQuery(f);
    expect(q).toContain("tag=t1%2Ct2"); expect(q).toContain("view=table"); expect(q).toContain("page=3"); expect(q).toContain("q=clinic");
    expect(toReleaseQuery(parseReleaseFilters({}))).toBe("");
  });
});
