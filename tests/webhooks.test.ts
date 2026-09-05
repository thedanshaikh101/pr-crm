import { describe, expect, it } from "vitest";
import { BACKOFF_MINUTES, backoffMinutes, deliveryBody, deliveryHeaders, isSuccess, MAX_ATTEMPTS, nextRetryAt, signPayload, verifySignature } from "@/lib/settings/webhooks";

describe("webhook signing", () => {
  it("signs with HMAC-SHA256 hex and verifies with or without the sha256= prefix", () => {
    const sig = signPayload("whsec_test", '{"a":1}');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySignature("whsec_test", '{"a":1}', sig)).toBe(true);
    expect(verifySignature("whsec_test", '{"a":1}', `sha256=${sig}`)).toBe(true);
    expect(verifySignature("whsec_test", '{"a":2}', sig)).toBe(false);
    expect(verifySignature("other", '{"a":1}', sig)).toBe(false);
    expect(verifySignature("whsec_test", '{"a":1}', null)).toBe(false);
    expect(verifySignature("whsec_test", '{"a":1}', "nothex")).toBe(false);
  });
  it("builds headers that match the body signature", () => {
    const body = deliveryBody({ id: "d1", event: "release.published", createdAt: new Date("2026-01-01T00:00:00Z"), payload: { releaseId: "r1" } });
    expect(JSON.parse(body)).toEqual({ id: "d1", event: "release.published", createdAt: "2026-01-01T00:00:00.000Z", data: { releaseId: "r1" } });
    const h = deliveryHeaders("s", body, "release.published", "d1");
    expect(h["X-Pressdesk-Event"]).toBe("release.published");
    expect(h["X-Pressdesk-Delivery"]).toBe("d1");
    expect(verifySignature("s", body, h["X-Pressdesk-Signature"])).toBe(true);
  });
});

describe("retry schedule", () => {
  const now = new Date("2026-09-05T12:00:00Z");
  it("uses 1m, 5m, 30m, 2h, 12h by attempt", () => {
    expect(BACKOFF_MINUTES).toEqual([1, 5, 30, 120, 720]);
    expect([1, 2, 3, 4, 5].map(backoffMinutes)).toEqual([1, 5, 30, 120, 720]);
    expect(backoffMinutes(0)).toBe(1);
    expect(backoffMinutes(9)).toBe(720);
  });
  it("schedules a retry after a failure and stops at the max", () => {
    expect(nextRetryAt(1, 500, now)?.getTime()).toBe(now.getTime() + 60_000);
    expect(nextRetryAt(2, 0, now)?.getTime()).toBe(now.getTime() + 5 * 60_000);
    expect(nextRetryAt(4, 503, now)?.getTime()).toBe(now.getTime() + 120 * 60_000);
    expect(nextRetryAt(MAX_ATTEMPTS, 500, now)).toBeNull();
  });
  it("never retries a 2xx", () => {
    expect(isSuccess(204)).toBe(true);
    expect(isSuccess(301)).toBe(false);
    expect(isSuccess(null)).toBe(false);
    expect(nextRetryAt(1, 200, now)).toBeNull();
  });
});
