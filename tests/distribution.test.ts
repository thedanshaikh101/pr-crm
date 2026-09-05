import { describe, expect, it } from "vitest";
import { parseAdHoc, resolveRecipients } from "@/lib/releases/recipients";
import { fromAllowed, isHostname, formatFrom } from "@/lib/email/domains";
import { localToUtc, utcToLocalInput } from "@/lib/releases/schedule";

describe("recipient resolution", () => {
  it("parses ad hoc lines", () => {
    expect(parseAdHoc('Jane Doe <Jane@Example.com>\nbob@x.org\n\nnot an email\n"Q" <q@q.io>')).toEqual([
      { name: "Jane Doe", email: "jane@example.com" }, { name: null, email: "bob@x.org" }, { name: "Q", email: "q@q.io" },
    ]);
  });
  it("dedupes case-insensitively and counts unsendable", () => {
    const r = resolveRecipients([
      { contactId: "c1", name: "A", email: "A@x.com", emailStatus: "VALID", source: "list" },
      { contactId: "c1", name: "A", email: "a@x.com", emailStatus: "VALID", source: "contact" },
      { contactId: "c2", name: "B", email: null, source: "list" },
      { contactId: "c3", name: "C", email: "c@x.com", emailStatus: "BOUNCED", source: "list" },
      { contactId: "c4", name: "D", email: "d@x.com", emailStatus: "UNSUBSCRIBED", source: "list" },
      { name: "E", email: "e@x.com", source: "adhoc" },
      { name: "F", email: "F@X.com", emailStatus: "UNVERIFIED", source: "adhoc" },
      { name: "bad", email: "nope", source: "adhoc" },
    ], ["E@x.com"]);
    expect(r.total).toBe(8);
    expect(r.unique).toBe(3); // a, e, f
    expect(r.duplicates).toBe(1);
    expect(r.noValidEmail).toBe(4); // no email, bounced, unsubscribed, bad syntax
    expect(r.suppressed).toBe(1); // e
    expect(r.sending).toBe(2);
    expect(r.recipients.map((x) => x.email)).toEqual(["a@x.com", "f@x.com"]);
    expect(r.recipients[0].contactId).toBe("c1");
  });
});

describe("fromAllowed", () => {
  const domains = [{ domain: "news.northstar.example", status: "VERIFIED" }, { domain: "pending.example", status: "PENDING" }];
  it("allows verified domains only", () => {
    expect(fromAllowed(domains, "media@news.northstar.example")).toBe(true);
    expect(fromAllowed(domains, "Media@NEWS.northstar.example")).toBe(true);
    expect(fromAllowed(domains, "x@pending.example")).toBe(false);
    expect(fromAllowed(domains, "x@gmail.com")).toBe(false);
    expect(fromAllowed(domains, "not-an-email")).toBe(false);
  });
  it("validates hostnames and formats From", () => {
    expect(isHostname("news.example.com")).toBe(true);
    expect(isHostname("http://x.com")).toBe(false);
    expect(isHostname("localhost")).toBe(false);
    expect(formatFrom("Dana <R>", "d@x.com")).toBe("Dana R <d@x.com>");
  });
});

describe("schedule conversion", () => {
  it("interprets datetime-local in the account timezone and stores UTC", () => {
    expect(localToUtc("2026-01-15T09:00", "America/Toronto")?.toISOString()).toBe("2026-01-15T14:00:00.000Z");
    expect(localToUtc("2026-07-15T09:00", "America/Toronto")?.toISOString()).toBe("2026-07-15T13:00:00.000Z");
    expect(localToUtc("2026-07-15T09:00", "UTC")?.toISOString()).toBe("2026-07-15T09:00:00.000Z");
    expect(localToUtc("garbage", "UTC")).toBeNull();
  });
  it("round-trips back to a local input value", () => {
    expect(utcToLocalInput(new Date("2026-07-15T13:00:00Z"), "America/Toronto")).toBe("2026-07-15T09:00");
  });
});
