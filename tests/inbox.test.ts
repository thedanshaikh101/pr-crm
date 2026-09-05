import { describe, expect, it } from "vitest";
import { conversationFromEmail, normalizeInboundEmail, parseAddress, senderDomain } from "@/lib/responseDesk/inbox";

describe("normalizeInboundEmail", () => {
  it("reads the Resend inbound shape", () => {
    const n = normalizeInboundEmail({ from: "Dana Reyes <dana@cbc.ca>", to: ["media@northstar.example"], subject: "  Clinic   opening  ", text: "Can we get a spokesperson?\r\nThanks", html: "<p>ignored when text exists</p>", headers: { "Message-ID": "<abc123@cbc.ca>", Date: "2026-09-05T10:00:00Z" } });
    expect(n.fromEmail).toBe("dana@cbc.ca");
    expect(n.fromName).toBe("Dana Reyes");
    expect(n.subject).toBe("Clinic opening");
    expect(n.textExcerpt).toBe("Can we get a spokesperson?\nThanks");
    expect(n.messageId).toBe("abc123@cbc.ca");
    expect(n.receivedAt.toISOString()).toBe("2026-09-05T10:00:00.000Z");
  });
  it("unwraps a {type, data} envelope", () => {
    const n = normalizeInboundEmail({ type: "email.received", data: { from: "x@y.com", subject: "Hi", text: "body", headers: [{ name: "message-id", value: "<m1@y.com>" }] } });
    expect(n.fromEmail).toBe("x@y.com");
    expect(n.messageId).toBe("m1@y.com");
  });
  it("reads the generic shape, strips html and caps the excerpt at 600 chars", () => {
    const long = "word ".repeat(300);
    const n = normalizeInboundEmail({ from: { name: "Sam", email: "SAM@Globalnews.ca" }, subject: "Q", html: `<div><b>Hello</b> ${long}</div>`, messageId: "gen-1", receivedAt: "2026-01-01T00:00:00Z" });
    expect(n.fromEmail).toBe("sam@globalnews.ca");
    expect(n.fromName).toBe("Sam");
    expect(n.textExcerpt.startsWith("Hello word")).toBe(true);
    expect(n.textExcerpt.length).toBe(600);
    expect(n.messageId).toBe("gen-1");
  });
  it("copes with missing fields", () => {
    const n = normalizeInboundEmail({});
    expect(n.fromEmail).toBeNull();
    expect(n.subject).toBe("(no subject)");
    expect(n.textExcerpt).toBe("");
    expect(n.messageId).toBeNull();
    expect(n.receivedAt).toBeInstanceOf(Date);
    expect(normalizeInboundEmail({ from: "bare@host.io", receivedAt: "nope" }).fromEmail).toBe("bare@host.io");
  });
  it("parses address variants", () => {
    expect(parseAddress('"Reyes, Dana" <d@x.com>')).toEqual({ email: "d@x.com", name: "Reyes, Dana" });
    expect(parseAddress([{ address: "a@b.c", name: "A" }])).toEqual({ email: "a@b.c", name: "A" });
    expect(senderDomain("me@CBC.ca")).toBe("cbc.ca");
    expect(senderDomain(null)).toBeNull();
  });
});

describe("conversationFromEmail", () => {
  const norm = normalizeInboundEmail({ from: "Dana <dana@cbc.ca>", subject: "Interview?", text: "Is anyone free at 6?", messageId: "m-9", receivedAt: "2026-09-05T10:00:00Z" });
  it("uses the contact organization and links the contact", () => {
    const d = conversationFromEmail(norm, { id: "c1", organization: { name: "CBC News" } });
    expect(d).toMatchObject({ channel: "EMAIL", status: "NEW", contactId: "c1", outletName: "CBC News", sourceMessageId: "m-9" });
    expect(d.question).toBe("Interview?\n\nIs anyone free at 6?");
    expect(d.receivedAt.toISOString()).toBe("2026-09-05T10:00:00.000Z");
  });
  it("falls back to the sender domain when no contact matches", () => {
    const d = conversationFromEmail(norm, null);
    expect(d.contactId).toBeNull();
    expect(d.outletName).toBe("cbc.ca");
  });
  it("uses the subject alone when there is no body", () => {
    const d = conversationFromEmail(normalizeInboundEmail({ from: "a@b.co", subject: "Just a subject" }), null);
    expect(d.question).toBe("Just a subject");
  });
});
