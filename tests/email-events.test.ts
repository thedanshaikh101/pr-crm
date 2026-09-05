import { describe, expect, it } from "vitest";
import { normalizeResendEvent } from "@/lib/email/normalize";
import { mergeFields, htmlToText } from "@/lib/email/provider";

describe("email tracking webhooks", () => {
  it("normalizes Resend events", () => {
    expect(normalizeResendEvent({ type: "email.opened", data: { email_id: "m1" } })).toMatchObject({ type: "opened", providerMsgId: "m1" });
    expect(normalizeResendEvent({ type: "email.bounced", data: { email_id: "m2", bounce: { type: "Permanent" } } })).toMatchObject({ type: "bounced", bounceType: "hard" });
    expect(normalizeResendEvent({ type: "email.clicked", data: { email_id: "m3", click: { link: "https://x.y" } } })?.url).toBe("https://x.y");
    expect(normalizeResendEvent({ type: "email.delivery_delayed", data: { email_id: "m4" } })).toBeNull();
    expect(normalizeResendEvent({})).toBeNull();
  });
});

describe("merge fields", () => {
  it("substitutes with fallbacks", () => {
    expect(mergeFields("Hi {{first_name|there}}, from {{outlet}}", { first_name: "", outlet: "CBC" })).toBe("Hi there, from CBC");
    expect(mergeFields("Hi {{ first_name }}", { first_name: "Jane" })).toBe("Hi Jane");
  });
  it("makes a plain-text alternative", () => { expect(htmlToText("<p>Hello<br>World</p><p>&amp;</p>")).toBe("Hello\nWorld\n&"); });
});
