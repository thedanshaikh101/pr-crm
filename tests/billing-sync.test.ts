import { describe, expect, it } from "vitest";
import { describeStatus, subscriptionToAccountPatch } from "@/lib/billing/sync";
import { priceMapFromEnv } from "@/lib/billing/stripe";

const priceMap = priceMapFromEnv({ STRIPE_PRICE_STARTER_MONTHLY: "price_sm", STRIPE_PRICE_STARTER_ANNUAL: "price_sa", STRIPE_PRICE_AGENCY_MONTHLY: "price_am", STRIPE_PRICE_AGENCY_ANNUAL: "price_aa" });
const now = new Date("2026-09-05T00:00:00Z");
const sub = (over: Partial<Parameters<typeof subscriptionToAccountPatch>[0]> & { price?: any }) => ({
  id: "sub_1", status: "active", cancel_at_period_end: false, current_period_end: 1_790_000_000, trial_end: null,
  items: { data: [{ price: over.price ?? { id: "price_sm", recurring: { interval: "month" } } }] }, ...over,
});

describe("subscriptionToAccountPatch", () => {
  it("maps an active starter monthly subscription from the env price map", () => {
    const p = subscriptionToAccountPatch(sub({ price: { id: "price_sm", metadata: {}, recurring: null } }), priceMap, now);
    expect(p).toMatchObject({ plan: "STARTER", billingInterval: "month", stripeSubId: "sub_1", subscriptionStatus: "active", cancelAtPeriodEnd: false, trialEndsAt: null });
    expect(p.currentPeriodEnd?.getTime()).toBe(1_790_000_000 * 1000);
  });
  it("prefers price metadata for plan and reads annual interval, keeps trial end while trialing", () => {
    const p = subscriptionToAccountPatch(sub({ status: "trialing", trial_end: 1_760_000_000, price: { id: "price_unknown", metadata: { plan: "agency" }, recurring: { interval: "year" } } }), priceMap, now);
    expect(p.plan).toBe("AGENCY");
    expect(p.billingInterval).toBe("year");
    expect(p.subscriptionStatus).toBe("trialing");
    expect(p.trialEndsAt?.getTime()).toBe(1_760_000_000 * 1000);
  });
  it("drops back to trial when the subscription is canceled", () => {
    const p = subscriptionToAccountPatch(sub({ status: "canceled", cancel_at_period_end: true }), priceMap, now);
    expect(p).toEqual({ plan: "TRIAL", billingInterval: null, stripeSubId: null, subscriptionStatus: "canceled", currentPeriodEnd: null, cancelAtPeriodEnd: false, trialEndsAt: now });
  });
  it("treats unpaid and incomplete_expired like canceled, past_due keeps the plan", () => {
    expect(subscriptionToAccountPatch(sub({ status: "unpaid" }), priceMap, now).plan).toBe("TRIAL");
    expect(subscriptionToAccountPatch(sub({ status: "incomplete_expired" }), priceMap, now).plan).toBe("TRIAL");
    const pd = subscriptionToAccountPatch(sub({ status: "past_due" }), priceMap, now);
    expect(pd.plan).toBe("STARTER");
    expect(pd.subscriptionStatus).toBe("past_due");
  });
  it("carries cancel_at_period_end through", () => {
    expect(subscriptionToAccountPatch(sub({ cancel_at_period_end: true }), priceMap, now).cancelAtPeriodEnd).toBe(true);
  });
  it("falls back to STARTER when the price is unknown", () => {
    expect(subscriptionToAccountPatch(sub({ price: { id: "price_x" } }), {}, now).plan).toBe("STARTER");
  });
});

describe("describeStatus", () => {
  it("counts trial days", () => {
    const s = describeStatus({ plan: "TRIAL", subscriptionStatus: null, trialEndsAt: new Date(now.getTime() + 3 * 864e5), cancelAtPeriodEnd: false }, now);
    expect(s.label).toBe("Trialing, 3 days left");
  });
  it("flags expired trials, past due and pending cancellation", () => {
    expect(describeStatus({ plan: "TRIAL", subscriptionStatus: null, trialEndsAt: new Date(now.getTime() - 864e5), cancelAtPeriodEnd: false }, now).label).toBe("Trial expired");
    expect(describeStatus({ plan: "STARTER", subscriptionStatus: "past_due", trialEndsAt: null, cancelAtPeriodEnd: false }, now).tone).toBe("bad");
    expect(describeStatus({ plan: "STARTER", subscriptionStatus: "active", trialEndsAt: null, cancelAtPeriodEnd: true }, now).label).toMatch(/cancels/);
  });
});
