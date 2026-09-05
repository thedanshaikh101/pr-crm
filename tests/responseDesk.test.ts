import { describe, expect, it } from "vitest";
import { slaState, slaLabel, isOpenStatus } from "@/lib/responseDesk/sla";
import { nextVersion, statementEffectiveStatus, bodyChanged } from "@/lib/responseDesk/statements";
import { buildConversationWhere, parseConversationFilters, toConversationQuery, activeConversationFilterCount, conversationOrder } from "@/lib/responseDesk/filters";
import { entityHref, proposedTimesOf, nextProposed, selectOptions, truncate } from "@/lib/responseDesk/labels";

const now = new Date("2026-09-05T12:00:00Z");
const h = (n: number) => new Date(now.getTime() + n * 36e5);

describe("slaState", () => {
  it("is overdue when the deadline passed and the conversation is still open", () => {
    expect(slaState(h(-1), "NEW", now)).toBe("overdue");
    expect(slaState(h(-1), "IN_PROGRESS", now)).toBe("overdue");
  });
  it("warns under four hours and is ok beyond", () => {
    expect(slaState(h(3.9), "NEW", now)).toBe("soon");
    expect(slaState(h(4.1), "NEW", now)).toBe("ok");
  });
  it("is done for responded or closed regardless of deadline", () => {
    expect(slaState(h(-10), "RESPONDED", now)).toBe("done");
    expect(slaState(h(10), "CLOSED", now)).toBe("done");
  });
  it("handles missing or invalid deadlines", () => {
    expect(slaState(null, "NEW", now)).toBe("none");
    expect(slaState("not a date", "NEW", now)).toBe("none");
    expect(slaLabel(null, "NEW", now)).toBe("no deadline");
  });
  it("labels time left and overdue spans", () => {
    expect(slaLabel(h(2), "NEW", now)).toBe("2h left");
    expect(slaLabel(h(-48), "NEW", now)).toBe("overdue by 2d");
    expect(slaLabel(h(0.25), "NEW", now)).toBe("15m left");
    expect(isOpenStatus("NEW")).toBe(true);
    expect(isOpenStatus("CLOSED")).toBe(false);
  });
});

describe("statements", () => {
  it("nextVersion is max + 1, starting at 1", () => {
    expect(nextVersion([])).toBe(1);
    expect(nextVersion([{ version: 1 }, { version: 3 }, { version: 2 }])).toBe(4);
  });
  it("effective status expires approved statements past expiresAt", () => {
    expect(statementEffectiveStatus({ status: "APPROVED", expiresAt: h(-1) }, now)).toBe("EXPIRED");
    expect(statementEffectiveStatus({ status: "APPROVED", expiresAt: h(1) }, now)).toBe("APPROVED");
    expect(statementEffectiveStatus({ status: "APPROVED", expiresAt: null }, now)).toBe("APPROVED");
    expect(statementEffectiveStatus({ status: "DRAFT", expiresAt: h(-1) }, now)).toBe("DRAFT");
  });
  it("bodyChanged ignores surrounding whitespace", () => {
    expect(bodyChanged("<p>a</p>", "<p>a</p>\n")).toBe(false);
    expect(bodyChanged("<p>a</p>", "<p>b</p>")).toBe(true);
  });
});

describe("conversation filters", () => {
  it("pins accountId as the first AND clause and ignores URL accountId", () => {
    const w = buildConversationWhere(parseConversationFilters({ accountId: "acct_B", status: "NEW" } as any), "acct_A", "u1", now);
    expect(w.AND[0]).toEqual({ accountId: "acct_A" });
    expect(JSON.stringify(w)).not.toContain("acct_B");
  });
  it("adds overdue, mine and search clauses", () => {
    const f = parseConversationFilters({ overdue: "1", mine: "1", q: "clinic", channel: "PHONE", topic: "none" });
    const w = buildConversationWhere(f, "a", "u1", now);
    expect(w.AND).toContainEqual({ assigneeId: "u1" });
    expect(w.AND).toContainEqual({ topicId: null });
    expect(w.AND).toContainEqual({ channel: "PHONE" });
    expect(w.AND.find((x: any) => x.deadline)).toEqual({ deadline: { lt: now }, status: { notIn: ["RESPONDED", "CLOSED"] } });
    expect(w.AND.find((x: any) => x.OR).OR.some((c: any) => c.question)).toBe(true);
    expect(activeConversationFilterCount(f)).toBe(4);
  });
  it("falls back to defaults on bad input and round-trips the query", () => {
    const f = parseConversationFilters({ status: "BOGUS", page: "x" });
    expect(f.status).toBeUndefined();
    expect(f.page).toBe(1);
    expect(toConversationQuery(parseConversationFilters({}))).toBe("");
    const qs = toConversationQuery({ ...f, status: "NEW", page: 2, mine: true });
    expect(qs.startsWith("?")).toBe(true);
    expect(new URLSearchParams(qs).get("status")).toBe("NEW");
    expect(new URLSearchParams(qs).get("page")).toBe("2");
    expect(new URLSearchParams(qs).get("mine")).toBe("1");
    expect(new URLSearchParams(qs).has("per")).toBe(false);
  });
  it("sorts by deadline with nulls last by default", () => {
    expect(conversationOrder("deadline")[0]).toEqual({ deadline: { sort: "asc", nulls: "last" } });
    expect(conversationOrder("received")).toEqual([{ receivedAt: "desc" }]);
  });
});

describe("labels", () => {
  it("resolves entity links", () => {
    expect(entityHref("contact", "c1")).toBe("/contacts/c1");
    expect(entityHref("statement", "s1")).toBe("/response-desk/statements/s1");
    expect(entityHref("unknown", "x")).toBeNull();
    expect(entityHref(null, "x")).toBeNull();
  });
  it("parses proposed times and picks the next one", () => {
    const times = proposedTimesOf([h(5).toISOString(), "junk", 42, h(-5).toISOString()]);
    expect(times).toHaveLength(2);
    expect(nextProposed(times, now)).toBe(h(5).toISOString());
    expect(nextProposed([h(-5).toISOString()], now)).toBe(h(-5).toISOString());
    expect(nextProposed([], now)).toBeNull();
  });
  it("keeps the stored value in select options and truncates on word boundaries", () => {
    expect(selectOptions([], ["A", "B"], "Legacy")).toEqual(["Legacy", "A", "B"]);
    expect(selectOptions(["X"], ["A"], "X")).toEqual(["X"]);
    expect(truncate("one two three four", 10)).toBe("one two…");
  });
});
