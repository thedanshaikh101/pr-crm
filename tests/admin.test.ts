import { describe, expect, it } from "vitest";
import { accountStatus, extraFlags, mergeFeatureFlags, mrrFor, parseAdminSort, pct, rates, sortAccounts } from "@/lib/admin/metrics";

describe("admin: mrrFor", () => {
  it("uses the monthly price for monthly plans", () => { expect(mrrFor("STARTER", "month")).toBe(79); expect(mrrFor("AGENCY", "month")).toBe(249); });
  it("spreads annual prices over 12 months", () => { expect(mrrFor("STARTER", "year")).toBeCloseTo(790 / 12, 2); expect(mrrFor("AGENCY", "year")).toBeCloseTo(207.5, 2); });
  it("is zero for TRIAL, ENTERPRISE and unknown plans", () => { expect(mrrFor("TRIAL", "month")).toBe(0); expect(mrrFor("ENTERPRISE", "year")).toBe(0); expect(mrrFor("NOPE", null)).toBe(0); });
  it("treats a missing interval as monthly", () => { expect(mrrFor("STARTER", null)).toBe(79); expect(mrrFor("STARTER", undefined)).toBe(79); });
});

describe("admin: rates", () => {
  it("divides by delivered + bounced", () => {
    const r = rates({ delivered: 90, bounced: 10, complained: 1 });
    expect(r.base).toBe(100); expect(r.bounceRate).toBeCloseTo(0.1); expect(r.complaintRate).toBeCloseTo(0.01);
  });
  it("flags bounce above 2% and complaints above 0.1%, not at the threshold", () => {
    expect(rates({ delivered: 98, bounced: 2, complained: 0 }).highBounce).toBe(false);
    expect(rates({ delivered: 97, bounced: 3, complained: 0 }).highBounce).toBe(true);
    expect(rates({ delivered: 1000, bounced: 0, complained: 1 }).highComplaint).toBe(false);
    expect(rates({ delivered: 1000, bounced: 0, complained: 2 }).highComplaint).toBe(true);
  });
  it("handles no sends without dividing by zero", () => {
    const r = rates({ delivered: 0, bounced: 0, complained: 0 });
    expect(r.bounceRate).toBe(0); expect(r.highBounce).toBe(false); expect(r.base).toBe(0);
  });
  it("formats percentages", () => { expect(pct(0.0234)).toBe("2.34%"); expect(pct(0.001, 3)).toBe("0.100%"); });
});

describe("admin: account status and sorting", () => {
  const now = new Date("2026-09-05T00:00:00Z");
  it("labels trial days left, suspended, active", () => {
    expect(accountStatus({ plan: "TRIAL", suspendedAt: null, trialEndsAt: new Date("2026-09-10T00:00:00Z") }, now)).toMatchObject({ label: "trial, 5 days left", tone: "warn", daysLeft: 5 });
    expect(accountStatus({ plan: "TRIAL", suspendedAt: null, trialEndsAt: new Date("2026-09-01T00:00:00Z") }, now)).toMatchObject({ label: "trial ended", tone: "bad" });
    expect(accountStatus({ plan: "AGENCY", suspendedAt: new Date(), trialEndsAt: null }, now)).toMatchObject({ label: "suspended", tone: "bad" });
    expect(accountStatus({ plan: "STARTER", suspendedAt: null, trialEndsAt: null }, now)).toMatchObject({ label: "active", tone: "good" });
  });
  it("sorts by the requested key and falls back to created", () => {
    const rows = [
      { name: "B", createdAt: new Date("2026-01-01"), mrr: 79, contacts: 5, emails: 10, bounceRate: 0.5 },
      { name: "A", createdAt: new Date("2026-03-01"), mrr: 249, contacts: 50, emails: 1, bounceRate: 0.01 },
    ];
    expect(sortAccounts(rows, "name").map((r) => r.name)).toEqual(["A", "B"]);
    expect(sortAccounts(rows, "mrr").map((r) => r.name)).toEqual(["A", "B"]);
    expect(sortAccounts(rows, "bounce").map((r) => r.name)).toEqual(["B", "A"]);
    expect(sortAccounts(rows, "emails").map((r) => r.name)).toEqual(["B", "A"]);
    expect(sortAccounts(rows, "created").map((r) => r.name)).toEqual(["A", "B"]);
    expect(parseAdminSort("bogus")).toBe("created"); expect(parseAdminSort("mrr")).toBe("mrr");
  });
});

describe("admin: feature flags", () => {
  it("merges checkboxes with extras and round-trips extras", () => {
    const f = mergeFeatureFlags(["api", "webhooks"], '{"seatOverride": 12, "api": false}');
    expect(f).toMatchObject({ api: true, webhooks: true, newsletters: false, seatOverride: 12 });
    expect(JSON.parse(extraFlags(f))).toEqual({ seatOverride: 12 });
    expect(extraFlags({ api: true })).toBe("");
  });
  it("rejects non-object JSON", () => { expect(() => mergeFeatureFlags([], "[1,2]")).toThrow(); expect(() => mergeFeatureFlags([], "{bad")).toThrow(); });
});
