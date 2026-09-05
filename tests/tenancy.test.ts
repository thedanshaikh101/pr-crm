import { describe, expect, it } from "vitest";
import { buildContactWhere, parseFilters, activeFilterCount, toQuery } from "@/lib/contacts/filters";

describe("tenancy isolation in query builder", () => {
  it("always pins accountId as the first AND clause", () => {
    const w = buildContactWhere(parseFilters({}), "acct_A", "user_1");
    expect(w.AND[0]).toEqual({ accountId: "acct_A", deletedAt: null, mergedIntoId: null });
  });
  it("cannot be overridden by URL params", () => {
    const w = buildContactWhere(parseFilters({ accountId: "acct_B", org: "x" } as any), "acct_A", "user_1");
    expect(JSON.stringify(w)).not.toContain("acct_B");
    expect(w.AND[0].accountId).toBe("acct_A");
  });
  it("hides private contacts owned by others", () => {
    const w = buildContactWhere(parseFilters({}), "acct_A", "user_1");
    expect(w.AND[1]).toEqual({ OR: [{ visibility: "SHARED" }, { ownerId: "user_1" }] });
  });
});

describe("filter URL state", () => {
  it("round-trips and counts active filters", () => {
    const f = parseFilters({ cls: "Television,Radio", emailOnly: "true", aud: "Toronto", page: "2" });
    expect(f.cls).toEqual(["Television", "Radio"]); expect(activeFilterCount(f)).toBe(3);
    expect(toQuery(f)).toContain("cls=Television%2CRadio"); expect(toQuery(f)).toContain("page=2");
  });
  it("hides ex-journalists by default and ORs within a group", () => {
    const w = buildContactWhere(parseFilters({ method: "email,mobile" }), "a", "u");
    expect(JSON.stringify(w)).toContain('"isExJournalist":false');
    const m = w.AND.find((x: any) => x.OR && x.OR.some((y: any) => y.mobile));
    expect(m.OR).toHaveLength(2);
  });
});
