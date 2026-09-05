"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getViewer, requireRole, type Viewer } from "@/lib/auth";
import { appUrl, getStripe, priceIdFor, priceMapFromEnv, type Interval, type PlanKey } from "@/lib/billing/stripe";
import { subscriptionToAccountPatch } from "@/lib/billing/sync";

/** Billing must stay reachable when the trial has expired (requireViewer would bounce to /suspended). */
async function billingViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (v.account.suspendedAt) {
    const a = await db.account.findUnique({ where: { id: v.account.id }, select: { suspendedReason: true } });
    if (a?.suspendedReason !== "trial_expired") redirect("/suspended");
  }
  return v;
}

async function ensureCustomer(v: Viewer) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Billing is not configured on this server");
  const a = await db.account.findUnique({ where: { id: v.account.id } });
  if (!a) throw new Error("Account not found");
  if (a.stripeCustomerId) return { stripe, account: a, customerId: a.stripeCustomerId };
  const customer = await stripe.customers.create({ email: v.user.email, name: a.name, metadata: { accountId: a.id } });
  await db.account.update({ where: { id: a.id }, data: { stripeCustomerId: customer.id } });
  return { stripe, account: a, customerId: customer.id };
}

export async function startCheckout(plan: PlanKey, interval: Interval) {
  const v = await billingViewer(); requireRole(v, "ADMIN");
  const priceId = priceIdFor(plan, interval);
  if (!priceId) throw new Error(`No Stripe price configured for ${plan} ${interval}`);
  const { stripe, account, customerId } = await ensureCustomer(v);
  const trialEnd = account.trialEndsAt && account.trialEndsAt.getTime() > Date.now() + 48 * 36e5 ? Math.floor(account.trialEndsAt.getTime() / 1000) : undefined;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    payment_method_collection: "always",
    subscription_data: { metadata: { accountId: account.id }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
    metadata: { accountId: account.id },
    allow_promotion_codes: true,
    success_url: `${appUrl()}/settings/billing?ok=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/settings/billing`,
  });
  await audit(v.account.id, v.user.id, "billing.checkout_start", "account", account.id, { plan, interval });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  redirect(session.url);
}

export async function openPortal() {
  const v = await billingViewer(); requireRole(v, "ADMIN");
  const { stripe, customerId } = await ensureCustomer(v);
  const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${appUrl()}/settings/billing` });
  redirect(portal.url);
}

async function setCancel(cancel: boolean) {
  const v = await billingViewer(); requireRole(v, "OWNER");
  const stripe = getStripe();
  if (!stripe) throw new Error("Billing is not configured on this server");
  const a = await db.account.findUnique({ where: { id: v.account.id }, select: { stripeSubId: true } });
  if (!a?.stripeSubId) throw new Error("No active subscription");
  const sub = await stripe.subscriptions.update(a.stripeSubId, { cancel_at_period_end: cancel });
  await db.account.update({ where: { id: v.account.id }, data: subscriptionToAccountPatch(sub as any, priceMapFromEnv()) });
  await audit(v.account.id, v.user.id, cancel ? "billing.cancel_at_period_end" : "billing.resume", "account", v.account.id);
  revalidatePath("/settings/billing");
}

export async function cancelAtPeriodEnd() { await setCancel(true); }
export async function resumeSubscription() { await setCancel(false); }

/** After Checkout returns, pull the subscription so the page is right even if the webhook is late. */
export async function syncAfterCheckout(sessionId: string) {
  const v = await billingViewer(); requireRole(v, "ADMIN");
  const stripe = getStripe();
  if (!stripe || !sessionId) return;
  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
    if (s.metadata?.accountId !== v.account.id) return;
    const sub = s.subscription && typeof s.subscription !== "string" ? s.subscription : null;
    const patch: any = { ...(sub ? subscriptionToAccountPatch(sub as any, priceMapFromEnv()) : {}) };
    if (typeof s.customer === "string") patch.stripeCustomerId = s.customer;
    if (sub) { patch.suspendedAt = null; patch.suspendedReason = null; }
    await db.account.update({ where: { id: v.account.id }, data: patch });
  } catch (e) { console.error("[billing] sync after checkout failed:", (e as Error).message); }
}
