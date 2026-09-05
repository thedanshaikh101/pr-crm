import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountStatus, mrrFor, parseAdminSort, pct, rates, sortAccounts, ADMIN_SORTS } from "@/lib/admin/metrics";
import { currentPeriod, recipientAggregates } from "@/lib/admin/queries";
import { AdminNav } from "@/components/admin/AdminNav";

const TONE: Record<string, string> = { good: "bg-green-50 text-good", warn: "bg-amber-50 text-warn", bad: "bg-red-50 text-bad", neutral: "bg-neutral-100 text-neutral-600" };
const PLAN: Record<string, string> = { TRIAL: "bg-neutral-100 text-neutral-600", STARTER: "bg-accentSoft text-accent", AGENCY: "bg-accentSoft text-accent", ENTERPRISE: "bg-neutral-800 text-white" };

export default async function AdminPage({ searchParams }: { searchParams: { q?: string; sort?: string } }) {
  const v = await requireViewer();
  if (!v.user.isSuperAdmin) notFound();
  const q = (searchParams.q ?? "").trim();
  const sort = parseAdminSort(searchParams.sort);
  const period = currentPeriod();
  const [accounts, aggs] = await Promise.all([
    db.account.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] } : undefined,
      include: { _count: { select: { memberships: { where: { deactivatedAt: null } }, contacts: { where: { deletedAt: null } } } }, usage: { where: { period } } },
    }),
    recipientAggregates(30),
  ]);
  const rows = sortAccounts(accounts.map((a: any) => {
    const agg = aggs.get(a.id) ?? { delivered: 0, bounced: 0, complained: 0 };
    const r = rates(agg);
    return { id: a.id, name: a.name, slug: a.slug, plan: a.plan, billingInterval: a.billingInterval, createdAt: a.createdAt, status: accountStatus(a), members: a._count.memberships, contacts: a._count.contacts, emails: a.usage[0]?.emailsSent ?? 0, mrr: mrrFor(a.plan, a.billingInterval), bounceRate: r.bounceRate, complaintRate: r.complaintRate, high: r, agg };
  }), sort);
  const totals = rows.reduce((t, r) => ({ mrr: t.mrr + r.mrr, emails: t.emails + r.emails, paying: t.paying + (r.mrr > 0 && r.status.tone !== "bad" ? 1 : 0), delivered: t.delivered + r.agg.delivered, bounced: t.bounced + r.agg.bounced, complained: t.complained + r.agg.complained }), { mrr: 0, emails: 0, paying: 0, delivered: 0, bounced: 0, complained: 0 });
  const platform = rates(totals);
  const sortLink = (key: string, label: string) => <Link href={`/admin?${new URLSearchParams({ ...(q ? { q } : {}), sort: key })}`} className={sort === key ? "text-accent" : "hover:underline"} aria-sort={sort === key ? "descending" : undefined}>{label}{sort === key ? " ▾" : ""}</Link>;

  return (
    <div>
      <AdminNav current="accounts" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Accounts</h1>
        <form className="flex gap-2" role="search">
          <input name="q" defaultValue={q} className="input w-64" placeholder="Search name or slug" aria-label="Search accounts" />
          {sort !== "created" && <input type="hidden" name="sort" value={sort} />}
          <button className="btn">Search</button>
          {q && <Link href="/admin" className="btn">Clear</Link>}
        </form>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[["Accounts", rows.length.toLocaleString()], ["Active paying", totals.paying.toLocaleString()], ["MRR", `$${totals.mrr.toLocaleString(undefined, { maximumFractionDigits: 0 })}`], ["Emails this month", totals.emails.toLocaleString()], ["Platform bounce (30d)", pct(platform.bounceRate)], ["Platform complaints (30d)", pct(platform.complaintRate, 3)]].map(([k, val], i) => (
          <div key={k} className="card p-3"><p className="text-xs text-neutral-600">{k}</p><p className={`text-xl font-semibold ${(i === 4 && platform.highBounce) || (i === 5 && platform.highComplaint) ? "text-bad" : ""}`}>{val}</p></div>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="data">
          <thead><tr>
            <th>{sortLink("name", "Name")}</th><th>Plan</th><th>Status</th><th className="text-right">Members</th><th className="text-right">{sortLink("contacts", "Contacts")}</th>
            <th className="text-right">{sortLink("emails", "Emails (month)")}</th><th className="text-right">{sortLink("mrr", "MRR")}</th><th className="text-right">{sortLink("bounce", "Bounce 30d")}</th><th className="text-right">Complaints 30d</th><th>{sortLink("created", "Created")}</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/admin/${r.id}`} className="font-medium hover:underline">{r.name}</Link><span className="ml-1 text-xs text-neutral-500">{r.slug}</span></td>
                <td><span className={`pill ${PLAN[r.plan] ?? ""}`}>{r.plan.toLowerCase()}{r.billingInterval ? ` · ${r.billingInterval}` : ""}</span></td>
                <td><span className={`pill ${TONE[r.status.tone]}`}>{r.status.label}</span></td>
                <td className="text-right">{r.members}</td>
                <td className="text-right">{r.contacts.toLocaleString()}</td>
                <td className="text-right">{r.emails.toLocaleString()}</td>
                <td className="text-right">{r.mrr ? `$${r.mrr.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : <span className="text-neutral-400">0</span>}</td>
                <td className={`text-right ${r.high.highBounce ? "font-semibold text-bad" : ""}`} title={`${r.agg.bounced} bounced of ${r.agg.delivered + r.agg.bounced}`}>{r.high.base ? pct(r.bounceRate) : <span className="text-neutral-400">no sends</span>}</td>
                <td className={`text-right ${r.high.highComplaint ? "font-semibold text-bad" : ""}`} title={`${r.agg.complained} complaints`}>{r.high.base ? pct(r.complaintRate, 3) : <span className="text-neutral-400">no sends</span>}</td>
                <td>{r.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="bg-neutral-50 text-sm font-semibold">
            <td colSpan={3}>{rows.length} account{rows.length === 1 ? "" : "s"}, {totals.paying} paying</td>
            <td className="text-right">{rows.reduce((n, r) => n + r.members, 0)}</td>
            <td className="text-right">{rows.reduce((n, r) => n + r.contacts, 0).toLocaleString()}</td>
            <td className="text-right">{totals.emails.toLocaleString()}</td>
            <td className="text-right">${totals.mrr.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td className={`text-right ${platform.highBounce ? "text-bad" : ""}`}>{pct(platform.bounceRate)}</td>
            <td className={`text-right ${platform.highComplaint ? "text-bad" : ""}`}>{pct(platform.complaintRate, 3)}</td>
            <td></td>
          </tr></tfoot>
        </table>
        {!rows.length && <p className="p-6 text-sm text-neutral-500">{q ? "No accounts match that search." : "No accounts yet."}</p>}
      </div>
      <p className="mt-2 text-xs text-neutral-500">Bounce and complaint rates are over delivered plus bounced recipients of distributions created in the last 30 days. Red above 2% bounce or 0.1% complaints. Sort: {ADMIN_SORTS.join(", ")}.</p>
    </div>
  );
}
