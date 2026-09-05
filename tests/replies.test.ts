import { describe, expect, it } from "vitest";
import { matchReply, messageIdTokens, normalizeInbound, parseAddress, excerptOf } from "@/lib/email/replies";

const now = new Date("2026-09-05T12:00:00Z");
const candidates = [
  { id: "r1", providerMsgId: "abc-123", email: "jane@cbc.ca", sentAt: new Date("2026-09-01T00:00:00Z") },
  { id: "r2", providerMsgId: "def-456", email: "jane@cbc.ca", sentAt: new Date("2026-08-01T00:00:00Z") },
  { id: "r3", providerMsgId: "ghi-789", email: "old@cbc.ca", sentAt: new Date("2026-07-01T00:00:00Z") },
];

describe("matchReply", () => {
  it("matches by In-Reply-To containing the provider message id", () => {
    expect(matchReply({ from: "someone@else.com", inReplyTo: "<def-456@resend.dev>" }, candidates, now)?.id).toBe("r2");
  });
  it("matches by References when In-Reply-To is missing", () => {
    expect(matchReply({ from: "x@y.z", references: "<zzz@a> <abc-123@resend.dev>" }, candidates, now)?.id).toBe("r1");
  });
  it("falls back to the newest recipient with that sender email inside 30 days", () => {
    expect(matchReply({ from: "Jane Doe <Jane@CBC.ca>" }, candidates, now)?.id).toBe("r1");
    expect(matchReply({ from: "old@cbc.ca" }, candidates, now)).toBeNull();
    expect(matchReply({ from: "nobody@cbc.ca" }, candidates, now)).toBeNull();
  });
  it("extracts tokens and addresses", () => {
    expect(messageIdTokens("<abc-123@resend.dev>", "<x@y>")).toEqual(["abc-123@resend.dev", "abc-123", "x@y", "x"]);
    expect(parseAddress("Jane <J@X.com>")).toBe("j@x.com");
  });
  it("normalizes Resend inbound and the generic shape", () => {
    const r = normalizeInbound({ type: "email.received", data: { from: "a@b.c", to: ["m@d.e"], subject: "Re: hi", headers: [{ name: "In-Reply-To", value: "<abc-123@resend.dev>" }], text: "Thanks" } });
    expect(r).toMatchObject({ from: "a@b.c", subject: "Re: hi", inReplyTo: "<abc-123@resend.dev>", text: "Thanks" });
    expect(normalizeInbound({ from: "a@b.c", inReplyTo: "<x@y>", references: "<z@w>", text: "t" })).toMatchObject({ from: "a@b.c", inReplyTo: "<x@y>", references: "<z@w>" });
    expect(normalizeInbound({})).toBeNull();
  });
  it("excerpts the top of the reply only", () => {
    expect(excerptOf("Yes, interested.\n\nOn Mon, X wrote:\n> old")).toBe("Yes, interested.");
  });
});
