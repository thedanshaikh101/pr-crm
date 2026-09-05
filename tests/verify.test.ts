import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canVerify, classifyEmail, isEmailSyntaxValid, smtpCodeOf } from "@/lib/contacts/verify";
import { rateLimitMemory, rateLimitWith, resetMemoryBuckets } from "@/lib/ratelimit";

describe("verify: classifyEmail", () => {
  it("is INVALID on bad syntax or missing MX regardless of SMTP", () => {
    expect(classifyEmail({ syntaxOk: false, mxOk: true, smtpCode: 250 })).toBe("INVALID");
    expect(classifyEmail({ syntaxOk: true, mxOk: false })).toBe("INVALID");
  });
  it("is VALID on syntax + MX when SMTP was not attempted", () => { expect(classifyEmail({ syntaxOk: true, mxOk: true })).toBe("VALID"); });
  it("maps SMTP codes", () => {
    expect(classifyEmail({ syntaxOk: true, mxOk: true, smtpCode: 250 })).toBe("VALID");
    for (const c of [550, 551, 553]) expect(classifyEmail({ syntaxOk: true, mxOk: true, smtpCode: c })).toBe("INVALID");
    expect(classifyEmail({ syntaxOk: true, mxOk: true, smtpCode: 450 })).toBe("RISKY");
    expect(classifyEmail({ syntaxOk: true, mxOk: true, smtpCode: null })).toBe("RISKY");
  });
  it("never verifies protected statuses", () => { expect(canVerify("BOUNCED")).toBe(false); expect(canVerify("COMPLAINED")).toBe(false); expect(canVerify("UNSUBSCRIBED")).toBe(false); expect(canVerify("RISKY")).toBe(true); });
});

describe("verify: syntax and smtp parsing", () => {
  it("accepts normal addresses and rejects junk", () => {
    expect(isEmailSyntaxValid("jane.doe@cbc.ca")).toBe(true);
    expect(isEmailSyntaxValid("j+tips@sub.example.co.uk")).toBe(true);
    for (const bad of ["", "nope", "a@b", "a@@b.com", "a b@c.com", ".a@b.com", "a..b@c.com", "a@-b.com", "a@b.c"]) expect(isEmailSyntaxValid(bad), bad).toBe(false);
  });
  it("reads SMTP reply codes", () => { expect(smtpCodeOf("250 2.1.5 Ok")).toBe(250); expect(smtpCodeOf("550-5.1.1 no such user")).toBe(550); expect(smtpCodeOf("garbage")).toBeNull(); });
});

describe("rate limiter: in-memory fallback", () => {
  beforeEach(() => { resetMemoryBuckets(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-05T00:00:00Z")); });
  afterEach(() => vi.useRealTimers());
  it("allows max hits then blocks until the window resets", () => {
    for (let i = 0; i < 3; i++) expect(rateLimitMemory("k", 3, 1000)).toBe(true);
    expect(rateLimitMemory("k", 3, 1000)).toBe(false);
    vi.advanceTimersByTime(999);
    expect(rateLimitMemory("k", 3, 1000)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(rateLimitMemory("k", 3, 1000)).toBe(true);
  });
  it("keeps keys independent", () => {
    expect(rateLimitMemory("a", 1, 1000)).toBe(true); expect(rateLimitMemory("a", 1, 1000)).toBe(false); expect(rateLimitMemory("b", 1, 1000)).toBe(true);
  });
  it("falls back to memory when Redis throws", async () => {
    const broken = { incr: async () => { throw new Error("ECONNREFUSED"); }, pexpire: async () => 1 };
    expect(await rateLimitWith(broken, "x", 2, 1000)).toBe(true);
    expect(await rateLimitWith(broken, "x", 2, 1000)).toBe(true);
    expect(await rateLimitWith(broken, "x", 2, 1000)).toBe(false);
    expect(await rateLimitWith(null, "y", 1, 1000)).toBe(true);
    expect(await rateLimitWith(null, "y", 1, 1000)).toBe(false);
  });
  it("uses INCR + PEXPIRE on first hit with a working client", async () => {
    const store = new Map<string, number>(); const expires: string[] = [];
    const client = { incr: async (k: string) => { const n = (store.get(k) ?? 0) + 1; store.set(k, n); return n; }, pexpire: async (k: string) => { expires.push(k); return 1; } };
    expect(await rateLimitWith(client, "z", 2, 5000)).toBe(true);
    expect(await rateLimitWith(client, "z", 2, 5000)).toBe(true);
    expect(await rateLimitWith(client, "z", 2, 5000)).toBe(false);
    expect(expires).toEqual(["rl:z"]);
    expect(store.get("rl:z")).toBe(3);
  });
});
