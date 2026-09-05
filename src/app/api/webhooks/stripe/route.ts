import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";

// Step 6 wires checkout + portal. This handler already keeps plan state in sync so nothing is lost meanwhile.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!process.env.STRIPE_SECRET_KEY || !secret) return NextResponse.json({ error: "stripe not configured" }, { status: 501 });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature")!, secret); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const price = sub.items.data[0]?.price;
    const plan = sub.status === "active" || sub.status === "trialing" ? (price?.metadata?.plan ?? "STARTER") : "TRIAL";
    await db.account.updateMany({ where: { stripeCustomerId: String(sub.customer) }, data: { plan: plan as any, stripeSubId: sub.id, billingInterval: price?.recurring?.interval ?? null } });
  }
  return NextResponse.json({ received: true });
}
