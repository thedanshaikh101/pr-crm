// Thin Stripe wrapper. Everything billing-related goes through getStripe() so the app
// degrades cleanly (read-only billing page) when STRIPE_SECRET_KEY is empty.
import Stripe from "stripe";

export type PlanKey = "STARTER" | "AGENCY";
export type Interval = "month" | "year";
export type PriceMap = Record<string, { plan: string; interval: Interval }>;

const g = globalThis as unknown as { pdStripe?: Stripe };

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return (g.pdStripe ??= new Stripe(process.env.STRIPE_SECRET_KEY));
}

/** Env price ids keyed by plan + interval. */
export function priceIdFor(plan: PlanKey, interval: Interval): string | null {
  const key = `STRIPE_PRICE_${plan}_${interval === "year" ? "ANNUAL" : "MONTHLY"}`;
  return process.env[key] || null;
}

/** Reverse map: price id -> {plan, interval}, from the four env vars. */
export function priceMapFromEnv(env: Record<string, string | undefined> = process.env): PriceMap {
  const out: PriceMap = {};
  const add = (id: string | undefined, plan: string, interval: Interval) => { if (id) out[id] = { plan, interval }; };
  add(env.STRIPE_PRICE_STARTER_MONTHLY, "STARTER", "month");
  add(env.STRIPE_PRICE_STARTER_ANNUAL, "STARTER", "year");
  add(env.STRIPE_PRICE_AGENCY_MONTHLY, "AGENCY", "month");
  add(env.STRIPE_PRICE_AGENCY_ANNUAL, "AGENCY", "year");
  return out;
}

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
