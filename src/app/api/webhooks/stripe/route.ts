import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { priceMapFromEnv } from "@/lib/billing/stripe";
import { subscriptionToAccountPatch } from "@/lib/billing/sync";

// Stripe -> Account billing columns. Signature-verified; idempotent (every handler is an upsert-style update).
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!process.env.STRIPE_SECRET_KEY || !secret) return NextResponse.json({ error: "stripe not configured" }, { status: 501 });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature")!, secret); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }

  const priceMap = priceMapFromEnv();
  const customerId = (o: { customer?: string | { id: string } | null }) => (typeof o.customer === "string" ? o.customer : o.customer?.id) ?? null;

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const accountId = s.metadata?.accountId;
      const cust = customerId(s);
      if (accountId && cust) await db.account.updateMany({ where: { id: accountId, stripeCustomerId: null }, data: { stripeCustomerId: cust } });
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const cust = customerId(sub);
      const patch = subscriptionToAccountPatch(sub as any, priceMap);
      const paid = patch.plan !== "TRIAL";
      const data = { ...patch, ...(paid ? { suspendedAt: null, suspendedReason: null } : {}) };
      let n = cust ? (await db.account.updateMany({ where: { stripeCustomerId: cust }, data })).count : 0;
      if (!n && sub.metadata?.accountId) n = (await db.account.updateMany({ where: { id: sub.metadata.accountId }, data: { ...data, stripeCustomerId: cust ?? undefined } })).count;
      break;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const cust = customerId(inv);
      if (cust) await db.account.updateMany({ where: { stripeCustomerId: cust }, data: { subscriptionStatus: "past_due" } });
      break;
    }
    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice;
      const cust = customerId(inv);
      if (cust) await db.account.updateMany({ where: { stripeCustomerId: cust, NOT: { plan: "TRIAL" } }, data: { subscriptionStatus: "active" } });
      break;
    }
    default: break;
  }
  return NextResponse.json({ received: true });
}
