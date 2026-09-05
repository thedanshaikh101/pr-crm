// Pure mapping from a Stripe subscription to the Account billing columns. Used by the
// Stripe webhook receiver and by the billing page after checkout returns. No I/O.
import type { PriceMap } from "./stripe";

export type SubscriptionLike = {
  id: string;
  status: string; // trialing | active | past_due | canceled | unpaid | incomplete | incomplete_expired | paused
  cancel_at_period_end?: boolean | null;
  current_period_end?: number | null; // unix seconds
  trial_end?: number | null; // unix seconds
  items: { data: { price: { id: string; metadata?: Record<string, string> | null; recurring?: { interval?: string | null } | null } }[] };
};

export type AccountBillingPatch = {
  plan: "TRIAL" | "STARTER" | "AGENCY" | "ENTERPRISE";
  billingInterval: "month" | "year" | null;
  stripeSubId: string | null;
  subscriptionStatus: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
};

const ENDED = new Set(["canceled", "unpaid", "incomplete_expired"]);
const PLANS = new Set(["STARTER", "AGENCY", "ENTERPRISE"]);

function planFromPrice(price: SubscriptionLike["items"]["data"][number]["price"] | undefined, priceMap: PriceMap): AccountBillingPatch["plan"] {
  const meta = price?.metadata?.plan?.toUpperCase();
  if (meta && PLANS.has(meta)) return meta as AccountBillingPatch["plan"];
  const mapped = price ? priceMap[price.id]?.plan?.toUpperCase() : undefined;
  if (mapped && PLANS.has(mapped)) return mapped as AccountBillingPatch["plan"];
  return "STARTER";
}

function intervalFromPrice(price: SubscriptionLike["items"]["data"][number]["price"] | undefined, priceMap: PriceMap): "month" | "year" | null {
  const i = price?.recurring?.interval ?? (price ? priceMap[price.id]?.interval : undefined);
  return i === "month" || i === "year" ? i : null;
}

export function subscriptionToAccountPatch(sub: SubscriptionLike, priceMap: PriceMap = {}, now = new Date()): AccountBillingPatch {
  const price = sub.items?.data?.[0]?.price;
  if (ENDED.has(sub.status)) {
    return { plan: "TRIAL", billingInterval: null, stripeSubId: null, subscriptionStatus: sub.status, currentPeriodEnd: null, cancelAtPeriodEnd: false, trialEndsAt: now };
  }
  return {
    plan: planFromPrice(price, priceMap),
    billingInterval: intervalFromPrice(price, priceMap),
    stripeSubId: sub.id,
    subscriptionStatus: sub.status,
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    trialEndsAt: sub.status === "trialing" && sub.trial_end ? new Date(sub.trial_end * 1000) : null,
  };
}

/** Human status for the plan card. */
export function describeStatus(a: { plan: string; subscriptionStatus: string | null; trialEndsAt: Date | null; cancelAtPeriodEnd: boolean; suspendedReason?: string | null }, now = new Date()) {
  if (a.suspendedReason === "trial_expired") return { label: "Trial expired", tone: "bad" as const };
  if (a.plan === "TRIAL" || a.subscriptionStatus === "trialing") {
    const days = a.trialEndsAt ? Math.ceil((a.trialEndsAt.getTime() - now.getTime()) / 864e5) : null;
    if (days !== null && days <= 0) return { label: "Trial expired", tone: "bad" as const };
    return { label: days !== null ? `Trialing, ${days} day${days === 1 ? "" : "s"} left` : "Trialing", tone: "warn" as const };
  }
  if (a.subscriptionStatus === "past_due") return { label: "Past due", tone: "bad" as const };
  if (a.subscriptionStatus === "canceled") return { label: "Canceled", tone: "bad" as const };
  if (a.cancelAtPeriodEnd) return { label: "Active, cancels at period end", tone: "warn" as const };
  return { label: "Active", tone: "good" as const };
}
