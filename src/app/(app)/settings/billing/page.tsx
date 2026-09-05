import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { limitsFor, PLANS } from "@/lib/plans";
import { getStripe, priceIdFor, stripeConfigured, type Interval, type PlanKey } from "@/lib/billing/stripe";
import { describeStatus } from "@/lib/billing/sync";
import { cancelAtPeriodEnd, openPortal, resumeSubscription, startCheckout, syncAfterCheckout } from "@/server/billing";
import { ConfirmButton } from "@/components/settings/ConfirmButton";

export const dynamic = "force-dynamic";

const TONE = { good: "bg-green-50 text-good", warn: "bg-amber-50 text-warn", bad: "bg-red-50 text-bad", neutral: "bg-neutral-100 text-neutral-700" } as const;
const INVOICE_TONE: Record<string, string> = { paid: TONE.good, open: TONE.warn, draft: TONE.neutral, uncollectible: TONE.bad, void: TONE.neutral };

function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between"><p className="text-xs text-neutral-600">{label}</p><p className="text-xs text-neutral-500">{pct}%</p></div>
      <div className="mt-1 h-2 overflow-hidden rounded bg-neutral-100" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={max} aria-label={label}><div className={`h-full ${pct >= 100 ? "bg-bad" : pct >= 80 ? "bg-warn" : "bg-accent"}`} style={{ width: `${pct}%` }} /></div>
      <p className="mt-1 text-sm font-semibold">{used.toLocaleString()} <span className="font-normal text-neutral-500">of {max.toLocaleString()}</span></p>
    </div>
  );
}

export default async function BillingPage({ searchParams }: { searchParams: { ok?: string; session_id?: string } }) {
  // getViewer, not requireViewer: an expired trial must still reach this page to pay.
  const v = await getViewer();
  if (!v) redirect("/login");
  let account = await db.account.findUnique({ where: { id: v.account.id } });
  if (!account) redirect("/login");
  if (account.suspendedAt && account.suspendedReason !== "trial_expired") redirect("/suspended");
  if (searchParams.ok && searchParams.session_id && (v.role === "OWNER" || v.role === "ADMIN")) {
    await syncAfterCheckout(searchParams.session_id);
    account = (await db.account.findUnique({ where: { id: v.account.id } })) ?? account;
  }

  const period = new Date().toISOString().slice(0, 7);
  const [contacts, users, usage, newsrooms] = await Promise.all([
    db.contact.count({ where: { accountId: account.id, deletedAt: null } }),
    db.membership.count({ where: { accountId: account.id, deactivatedAt: null } }),
    db.usageCounter.findUnique({ where: { accountId_period: { accountId: account.id, period } } }),
    db.newsroomSettings.count({ where: { accountId: account.id } }),
  ]);
  const lim = limitsFor(account.plan);
  const status = describeStatus(account);
  const configured = stripeConfigured();
  const canAdmin = v.role === "OWNER" || v.role === "ADMIN";
  const isOwner = v.role === "OWNER";
  const hasSub = !!account.stripeSubId;

  let invoices: { id: string; number: string | null; created: number; total: number; currency: string; status: string | null; hosted: string | null; pdf: string | null }[] = [];
  let invoiceError: string | null = null;
  const stripe = getStripe();
  if (stripe && account.stripeCustomerId) {
    try {
      const list = await stripe.invoices.list({ customer: account.stripeCustomerId, limit: 24 });
      invoices = list.data.map((i) => ({ id: i.id, number: i.number, created: i.created, total: i.total, currency: i.currency, status: i.status, hosted: i.hosted_invoice_url ?? null, pdf: i.invoice_pdf ?? null }));
    } catch (e) { invoiceError = (e as Error).message; }
  }

  const planCards: { key: PlanKey; blurb: string }[] = [
    { key: "STARTER", blurb: "One newsroom, three seats, 10,000 contacts." },
    { key: "AGENCY", blurb: "Five newsrooms, ten seats, 50,000 contacts, client reporting." },
  ];
  const money = (cents: number, currency: string) => new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Billing</h1>{account.suspendedReason === "trial_expired" && <Link href="/suspended" className="text-xs text-neutral-500">Workspace paused</Link>}</div>

      {!configured && (
        <div className="rounded-md border border-warn bg-amber-50 p-3 text-sm" role="status">
          <p className="font-medium">Billing is not configured on this server.</p>
          <p className="text-neutral-700">Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and the four STRIPE_PRICE_* variables to enable checkout, invoices and the customer portal. Plan details and usage below still work.</p>
        </div>
      )}
      {searchParams.ok && <p className="rounded-md border border-good bg-green-50 p-3 text-sm text-good" role="status">Thanks. Your subscription is set up. If the plan below has not updated yet, refresh in a moment.</p>}

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-neutral-600">Current plan</p>
            <p className="text-2xl font-semibold">{account.plan.charAt(0) + account.plan.slice(1).toLowerCase()}{account.billingInterval && <span className="ml-2 text-sm font-normal text-neutral-500">billed {account.billingInterval === "year" ? "annually" : "monthly"}</span>}</p>
            <p className="mt-1"><span className={`pill ${TONE[status.tone]}`}>{status.label}</span></p>
            {account.currentPeriodEnd && <p className="mt-2 text-sm text-neutral-600">Current period ends {account.currentPeriodEnd.toLocaleDateString()}{account.cancelAtPeriodEnd ? ". The subscription cancels then and the workspace returns to a trial." : "."}</p>}
            {account.plan === "TRIAL" && account.trialEndsAt && !account.stripeSubId && <p className="mt-2 text-sm text-neutral-600">Trial ends {account.trialEndsAt.toLocaleDateString()}. Choose a plan below; your card is only charged when the trial ends.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {canAdmin && <form action={openPortal}><button className="btn" disabled={!configured || !account.stripeCustomerId} title={!account.stripeCustomerId ? "Available after your first checkout" : undefined}>Manage billing</button></form>}
            {isOwner && hasSub && !account.cancelAtPeriodEnd && (
              <form action={cancelAtPeriodEnd}><ConfirmButton title="Cancel subscription" message="Your plan stays active until the end of the current period, then the workspace returns to a trial. You can resume at any time before then." confirmLabel="Cancel at period end" disabled={!configured}>Cancel plan</ConfirmButton></form>
            )}
            {isOwner && hasSub && account.cancelAtPeriodEnd && <form action={resumeSubscription}><button className="btn btn-primary" disabled={!configured}>Resume subscription</button></form>}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Usage</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Meter label="Contacts" used={contacts} max={lim.contacts} />
          <Meter label="Users" used={users} max={lim.users} />
          <Meter label="Emails this month" used={usage?.emailsSent ?? 0} max={lim.emailsPerMonth} />
          <Meter label="Newsrooms" used={Math.max(newsrooms, 1)} max={lim.newsrooms} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Plans</h2>
        <div className="grid gap-3 lg:grid-cols-3">
          {planCards.map((p) => {
            const lp = PLANS[p.key];
            const current = account.plan === p.key && hasSub;
            return (
              <div key={p.key} className={`card p-4 ${current ? "border-accent" : ""}`}>
                <div className="flex items-baseline justify-between"><p className="font-semibold">{p.key.charAt(0) + p.key.slice(1).toLowerCase()}</p>{current && <span className="pill bg-accentSoft text-accent">Current</span>}</div>
                <p className="mt-1 text-sm text-neutral-600">{p.blurb}</p>
                <p className="mt-3 text-2xl font-semibold">${lp.priceMonthly}<span className="text-sm font-normal text-neutral-500"> /month</span></p>
                <p className="text-xs text-neutral-500">or ${lp.priceAnnual} /year (two months free)</p>
                {canAdmin && (
                  <div className="mt-3 flex gap-2">
                    {(["month", "year"] as Interval[]).map((interval) => {
                      const disabled = !configured || !priceIdFor(p.key, interval) || (current && account!.billingInterval === interval);
                      return (
                        <form key={interval} action={startCheckout.bind(null, p.key, interval)}>
                          <button className={`btn ${interval === "month" ? "btn-primary" : ""}`} disabled={disabled} title={!configured ? "Billing is not configured" : !priceIdFor(p.key, interval) ? `STRIPE_PRICE_${p.key}_${interval === "year" ? "ANNUAL" : "MONTHLY"} is not set` : undefined}>
                            {current && account!.billingInterval === interval ? "Current" : interval === "month" ? "Choose monthly" : "Choose annual"}
                          </button>
                        </form>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <div className="card p-4">
            <p className="font-semibold">Enterprise</p>
            <p className="mt-1 text-sm text-neutral-600">Unlimited seats and newsrooms, dedicated sending IPs, SSO, a signed DPA.</p>
            <p className="mt-3 text-2xl font-semibold">Custom</p>
            <a href="mailto:sales@pressdesk.example?subject=Enterprise%20plan" className="btn mt-3">Contact us</a>
          </div>
        </div>
        {!canAdmin && <p className="mt-2 text-xs text-neutral-500">Only owners and admins can change the plan.</p>}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Invoices</h2>
        {invoiceError && <p className="mb-2 text-sm text-bad">Could not load invoices: {invoiceError}</p>}
        {invoices.length ? (
          <div className="card overflow-x-auto">
            <table className="data">
              <thead><tr><th>Number</th><th>Date</th><th>Amount</th><th>Status</th><th>Links</th></tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="font-medium">{i.number ?? i.id}</td>
                    <td>{new Date(i.created * 1000).toLocaleDateString()}</td>
                    <td>{money(i.total, i.currency)}</td>
                    <td><span className={`pill ${INVOICE_TONE[i.status ?? ""] ?? TONE.neutral}`}>{i.status ?? "unknown"}</span></td>
                    <td className="space-x-2 text-xs">{i.hosted && <a href={i.hosted} className="underline" target="_blank" rel="noreferrer">View</a>}{i.pdf && <a href={i.pdf} className="underline" target="_blank" rel="noreferrer">PDF</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card p-6 text-center text-sm text-neutral-600">{configured ? account.stripeCustomerId ? "No invoices yet." : "Invoices appear here after your first checkout." : "Invoices are available once billing is configured."}</div>
        )}
      </section>
    </div>
  );
}
