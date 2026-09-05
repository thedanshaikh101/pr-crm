import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountStatus, extraFlags, KNOWN_FLAGS, mrrFor, pct, rates } from "@/lib/admin/metrics";
import { recipientAggregates } from "@/lib/admin/queries";
import { limitsFor } from "@/lib/plans";
import { impersonate, overridePlan, saveFeatureFlags, setRetentionDays, setThrottle, suspendAccount, unsuspendAccount } from "@/server/admin";
import { AdminNav } from "@/components/admin/AdminNav";

const FLAG_LABELS: Record<string, string> = { newsletters: "Newsletters", api: "REST API", webhooks: "Webhooks", customDomain: "Custom newsroom domain", aiAssist: "AI assist", betaCharts: "Beta charts" };
const DIST_TONE: Record<string, string> = { SENT: "bg-green-50 text-good", SENDING: "bg-amber-50 text-warn", QUEUED: "bg-amber-50 text-warn", FAILED: "bg-red-50 text-bad", CANCELLED: "bg-red-50 text-bad", DRAFT: "bg-neutral-100 text-neutral-600" };
const DOMAIN_TONE: Record<string, string> = { VERIFIED: "bg-green-50 text-good", PENDING: "bg-amber-50 text-warn", FAILED: "bg-red-50 text-bad" };

export default async function AdminAccountPage({ params }: { params: { accountId: string } }) {
  const v = await requireViewer();
  if (!v.user.isSuperAdmin) notFound();
  const a = await db.account.findUnique({
    where: { id: params.accountId },
    include: {
      memberships: { include: { user: { select: { id: true, name: true, email: true, lastSignInAt: true, isSuperAdmin: true } } }, orderBy: { createdAt: "asc" } },
      usage: { orderBy: { period: "desc" }, take: 12 },
      sendingDomains: { orderBy: { createdAt: "asc" } },
      distributions: { where: { isTest: false }, orderBy: { createdAt: "desc" }, take: 10, include: { release: { select: { headline: true } }, _count: { select: { recipients: { where: { bouncedAt: { not: null } } } } } } },
      _count: { select: { contacts: { where: { deletedAt: null } }, releases: { where: { deletedAt: null } }, coverage: { where: { deletedAt: null } }, apiKeys: { where: { revokedAt: null } }, webhooks: true } },
    },
  });
  if (!a) notFound();
  const [agg, adminLog] = await Promise.all([
    recipientAggregates(30, a.id),
    db.auditLog.findMany({ where: { accountId: a.id, action: { startsWith: "admin." } }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const adminUsers = adminLog.length ? await db.user.findMany({ where: { id: { in: adminLog.map((l: any) => l.userId).filter(Boolean) } }, select: { id: true, name: true } }) : [];
  const r = rates(agg.get(a.id) ?? { delivered: 0, bounced: 0, complained: 0 });
  const status = accountStatus(a);
  const flags = (a.featureFlags ?? {}) as Record<string, unknown>;
  const limits = limitsFor(a.plan);
  const Row = ({ k, val }: { k: string; val: React.ReactNode }) => <div className="flex justify-between gap-3 py-1 text-sm"><span className="text-neutral-500">{k}</span><span className="text-right">{val ?? <span className="text-neutral-300">none</span>}</span></div>;
  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="card p-4"><h2 className="mb-2 text-sm font-semibold">{title}</h2>{children}</section>;

  return (
    <div>
      <AdminNav current="account" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/admin" className="btn">← Accounts</Link>
        <h1 className="text-xl font-semibold">{a.name} <span className="text-sm font-normal text-neutral-500">{a.slug}</span></h1>
        <span className={`pill ${status.tone === "bad" ? "bg-red-50 text-bad" : status.tone === "warn" ? "bg-amber-50 text-warn" : "bg-green-50 text-good"}`}>{status.label}</span>
        <form action={impersonate.bind(null, a.id)} className="ml-auto"><button className="btn btn-primary">Impersonate</button></form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Details">
          <Row k="Account id" val={<code className="text-xs">{a.id}</code>} />
          <Row k="Plan" val={`${a.plan}${a.billingInterval ? ` (${a.billingInterval})` : ""} · MRR $${mrrFor(a.plan, a.billingInterval)}`} />
          <Row k="Plan limits" val={`${limits.users} users · ${limits.contacts.toLocaleString()} contacts · ${limits.emailsPerMonth.toLocaleString()} emails/month`} />
          <Row k="Subscription" val={a.subscriptionStatus} />
          <Row k="Stripe customer" val={a.stripeCustomerId} />
          <Row k="Stripe subscription" val={a.stripeSubId} />
          <Row k="Current period ends" val={a.currentPeriodEnd?.toLocaleString()} />
          <Row k="Cancel at period end" val={a.cancelAtPeriodEnd ? "yes" : "no"} />
          <Row k="Trial ends" val={a.trialEndsAt?.toLocaleString()} />
          <Row k="Timezone" val={a.timezone} />
          <Row k="Throttle" val={`${a.throttlePerMinute} emails/min`} />
          <Row k="Retention" val={a.retentionDays ? `${a.retentionDays} days` : "keep forever"} />
          <Row k="Contacts" val={a._count.contacts.toLocaleString()} />
          <Row k="Releases" val={a._count.releases} />
          <Row k="Coverage items" val={a._count.coverage} />
          <Row k="API keys / webhooks" val={`${a._count.apiKeys} / ${a._count.webhooks}`} />
          <Row k="Bounce rate (30d)" val={<span className={r.highBounce ? "font-semibold text-bad" : ""}>{r.base ? pct(r.bounceRate) : "no sends"}</span>} />
          <Row k="Complaint rate (30d)" val={<span className={r.highComplaint ? "font-semibold text-bad" : ""}>{r.base ? pct(r.complaintRate, 3) : "no sends"}</span>} />
          <Row k="Created" val={a.createdAt.toLocaleString()} />
          <Row k="Updated" val={a.updatedAt.toLocaleString()} />
          {a.suspendedAt && <Row k="Suspended" val={`${a.suspendedAt.toLocaleString()} · ${a.suspendedReason ?? ""}`} />}
        </Card>

        <div className="space-y-4">
          <Card title={a.suspendedAt ? "Suspended" : "Suspend"}>
            {a.suspendedAt ? (
              <form action={unsuspendAccount.bind(null, a.id)} className="flex items-center gap-3"><p className="text-sm text-neutral-600">Reason: {a.suspendedReason}</p><button className="btn ml-auto">Unsuspend</button></form>
            ) : (
              <form action={suspendAccount.bind(null, a.id)} className="flex gap-2"><input name="reason" className="input" placeholder="Reason (shown in audit log)" aria-label="Suspension reason" required /><button className="btn btn-danger shrink-0">Suspend</button></form>
            )}
            <p className="mt-1 text-xs text-neutral-500">Suspended accounts cannot sign in or use API keys.</p>
          </Card>
          <Card title="Plan override">
            <form action={overridePlan.bind(null, a.id)} className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
              <select name="plan" className="input" defaultValue={a.plan} aria-label="Plan">{["TRIAL", "STARTER", "AGENCY", "ENTERPRISE"].map((p) => <option key={p}>{p}</option>)}</select>
              <select name="billingInterval" className="input" defaultValue={a.billingInterval ?? ""} aria-label="Billing interval"><option value="">no interval</option><option value="month">month</option><option value="year">year</option></select>
              <input name="note" className="input" placeholder="Support note" aria-label="Note" />
              <button className="btn">Apply</button>
            </form>
            <p className="mt-1 text-xs text-neutral-500">For support cases only. Does not touch Stripe; logged as admin.plan_override.</p>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card title="Retention">
              <form action={setRetentionDays.bind(null, a.id)} className="flex gap-2"><input name="retentionDays" type="number" min={1} max={3650} className="input" defaultValue={a.retentionDays ?? ""} placeholder="days, blank keeps" aria-label="Retention days" /><button className="btn">Save</button></form>
            </Card>
            <Card title="Send throttle">
              <form action={setThrottle.bind(null, a.id)} className="flex gap-2"><input name="throttlePerMinute" type="number" min={1} max={10000} className="input" defaultValue={a.throttlePerMinute} aria-label="Emails per minute" /><button className="btn">Save</button></form>
            </Card>
          </div>
          <Card title="Feature flags">
            <form action={saveFeatureFlags.bind(null, a.id)} className="space-y-2">
              <div className="grid grid-cols-2 gap-1">
                {KNOWN_FLAGS.map((f) => <label key={f} className="flex items-center gap-2 text-sm"><input type="checkbox" name="flag" value={f} defaultChecked={!!flags[f]} /> {FLAG_LABELS[f]}</label>)}
              </div>
              <div><label className="label" htmlFor="extra">Extra flags (JSON object)</label><textarea id="extra" name="extra" rows={3} className="input font-mono text-xs" defaultValue={extraFlags(flags)} placeholder='{"maxSeatsOverride": 12}' /></div>
              <button className="btn">Save flags</button>
            </form>
          </Card>
        </div>

        <Card title={`Members (${a.memberships.filter((m: any) => !m.deactivatedAt).length} active)`}>
          <table className="data"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th></tr></thead>
            <tbody>{a.memberships.map((m: any) => <tr key={m.id} className={m.deactivatedAt ? "opacity-50" : ""}><td>{m.user.name}{m.user.isSuperAdmin && <span className="pill ml-1 bg-neutral-800 text-white">super</span>}{m.deactivatedAt && <span className="pill ml-1 bg-neutral-100 text-neutral-600">deactivated</span>}</td><td>{m.user.email}</td><td>{m.role.toLowerCase()}</td><td>{m.user.lastSignInAt ? m.user.lastSignInAt.toLocaleString() : <span className="text-neutral-400">never</span>}</td></tr>)}</tbody></table>
          {!a.memberships.length && <p className="p-2 text-sm text-neutral-500">No members.</p>}
        </Card>

        <Card title="Usage by period">
          <table className="data"><thead><tr><th>Period</th><th className="text-right">Emails sent</th><th className="text-right">Of limit</th></tr></thead>
            <tbody>{a.usage.map((u: any) => <tr key={u.id}><td>{u.period}</td><td className="text-right">{u.emailsSent.toLocaleString()}</td><td className="text-right">{pct(u.emailsSent / limits.emailsPerMonth, 1)}</td></tr>)}</tbody></table>
          {!a.usage.length && <p className="p-2 text-sm text-neutral-500">No emails sent yet.</p>}
        </Card>

        <Card title="Sending domains">
          <table className="data"><thead><tr><th>Domain</th><th>Status</th><th>Default from</th><th>Verified</th></tr></thead>
            <tbody>{a.sendingDomains.map((d: any) => <tr key={d.id}><td>{d.domain}</td><td><span className={`pill ${DOMAIN_TONE[d.status] ?? ""}`}>{d.status.toLowerCase()}</span></td><td>{d.defaultFrom}</td><td>{d.verifiedAt?.toLocaleDateString() ?? <span className="text-neutral-400">no</span>}</td></tr>)}</tbody></table>
          {!a.sendingDomains.length && <p className="p-2 text-sm text-neutral-500">No sending domains configured.</p>}
        </Card>

        <Card title="Last 10 distributions">
          <table className="data"><thead><tr><th>Release</th><th>Status</th><th className="text-right">Recipients</th><th className="text-right">Bounced</th><th>Created</th></tr></thead>
            <tbody>{a.distributions.map((d: any) => <tr key={d.id}><td className="max-w-xs truncate">{d.release.headline}</td><td><span className={`pill ${DIST_TONE[d.status] ?? ""}`}>{d.status.toLowerCase()}</span></td><td className="text-right">{d.recipientCount}</td><td className={`text-right ${d.recipientCount && d._count.recipients / d.recipientCount > 0.02 ? "font-semibold text-bad" : ""}`}>{d._count.recipients}</td><td>{d.createdAt.toLocaleDateString()}</td></tr>)}</tbody></table>
          {!a.distributions.length && <p className="p-2 text-sm text-neutral-500">Nothing sent yet.</p>}
        </Card>

        <Card title="Admin actions on this account">
          <ul className="divide-y divide-line text-sm">{adminLog.map((l: any) => <li key={l.id} className="py-1.5"><span className="mr-2 text-xs text-neutral-500">{l.createdAt.toLocaleString()}</span><code className="text-xs">{l.action}</code> <span className="text-neutral-600">by {adminUsers.find((u: any) => u.id === l.userId)?.name ?? "unknown"}</span>{l.meta && <span className="ml-2 text-xs text-neutral-500">{JSON.stringify(l.meta).slice(0, 120)}</span>}</li>)}</ul>
          {!adminLog.length && <p className="text-sm text-neutral-500">No super-admin actions recorded.</p>}
        </Card>
      </div>
    </div>
  );
}
