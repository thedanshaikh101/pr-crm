import { describe, expect, it } from "vitest";
import { apiKeyPrefix, generateApiKey, generateWebhookSecret, hashApiKey, isValidApiKey, randomBase62 } from "@/lib/settings/keys";
import { describeCounts, normalizeColor, planTagMerge } from "@/lib/settings/tags";
import { daysLeft, recycleCutoff, retentionCutoffs } from "@/lib/settings/retention";
import { PICKLIST_DEFAULTS } from "@/lib/settings/defaults";
import { createHash } from "crypto";

describe("api keys", () => {
  it("generates pd_live_ keys with 32 base62 chars, a 12-char prefix and a sha256 hex hash", () => {
    const k = generateApiKey();
    expect(k).toMatch(/^pd_live_[0-9A-Za-z]{32}$/);
    expect(isValidApiKey(k)).toBe(true);
    expect(apiKeyPrefix(k)).toHaveLength(12);
    expect(apiKeyPrefix(k)).toBe(k.slice(0, 12));
    expect(hashApiKey(k)).toBe(createHash("sha256").update(k).digest("hex"));
    expect(hashApiKey(k)).not.toBe(hashApiKey(generateApiKey()));
  });
  it("base62 only uses the alphabet", () => {
    for (let i = 0; i < 20; i++) expect(randomBase62(40)).toMatch(/^[0-9A-Za-z]{40}$/);
  });
  it("webhook secrets look like whsec_ + 32 chars", () => {
    expect(generateWebhookSecret()).toMatch(/^whsec_[0-9A-Za-z]{32}$/);
  });
});

describe("tag merge planning", () => {
  it("re-points all three join tables and sums the moved rows", () => {
    const p = planTagMerge("a", "b", { contacts: 3, releases: 1, coverage: 2 });
    expect(p.joins.map((j) => j.table)).toEqual(["contactTag", "releaseTag", "coverageTag"]);
    expect(p.maxMoved).toBe(6);
    expect(p.fromId).toBe("a");
    expect(p.intoId).toBe("b");
  });
  it("refuses to merge a tag into itself", () => {
    expect(() => planTagMerge("a", "a", { contacts: 0, releases: 0, coverage: 0 })).toThrow();
  });
  it("describes counts in plain English", () => {
    expect(describeCounts({ contacts: 1, releases: 0, coverage: 2 })).toBe("1 contact, 2 coverage items");
    expect(describeCounts({ contacts: 0, releases: 0, coverage: 0 })).toBe("nothing");
  });
  it("normalizes colors", () => {
    expect(normalizeColor("#abcdef")).toBe("#ABCDEF");
    expect(normalizeColor("red")).toBe("#1F5FBF");
    expect(normalizeColor(null, "#000000")).toBe("#000000");
  });
});

describe("retention and recycle bin", () => {
  const now = new Date("2026-09-05T04:30:00Z");
  it("computes cutoffs only for accounts with a positive retentionDays", () => {
    const r = retentionCutoffs([{ id: "a", retentionDays: 90 }, { id: "b", retentionDays: null }, { id: "c", retentionDays: 0 }], now);
    expect(r).toHaveLength(1);
    expect(r[0].accountId).toBe("a");
    expect(r[0].cutoff.toISOString()).toBe("2026-06-07T04:30:00.000Z");
  });
  it("recycle bin keeps rows 30 days", () => {
    expect(recycleCutoff(now).toISOString()).toBe("2026-08-06T04:30:00.000Z");
    expect(daysLeft(new Date("2026-09-02T04:30:00Z"), now)).toBe(27);
    expect(daysLeft(new Date("2026-07-01T00:00:00Z"), now)).toBe(0);
  });
  it("has pick list defaults for both kinds", () => {
    expect(PICKLIST_DEFAULTS.case_type).toContain("Media enquiry");
    expect(PICKLIST_DEFAULTS.topic_type).toContain("Crisis");
  });
});
