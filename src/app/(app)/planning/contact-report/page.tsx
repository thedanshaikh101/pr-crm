import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { contactReportData, type Count } from "@/lib/planning/contactReport";

export default async function ContactReportPage() {
  const v = await requireViewer();
  const d = await contactReportData(v.account.id);
  const pretty = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
  const Small = ({ title, rows, labelFmt, href }: { title: string; rows: Count[]; labelFmt?: (s: string) => string; href?: (s: string) => string }) => (
    <section className="card p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <table className="data"><thead><tr><th>Value</th><th className="text-right">Contacts</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.label}><td>{href ? <Link href={href(r.label)} className="hover:underline">{labelFmt ? labelFmt(r.label) : r.label}</Link> : labelFmt ? labelFmt(r.label) : r.label}</td><td className="text-right tabular-nums">{r.count.toLocaleString()}</td></tr>)}</tbody></table>
      {!rows.length && <p className="pt-2 text-sm text-neutral-500">Nothing recorded yet.</p>}
    </section>
  );
  const Top = ({ title, rows, unit }: { title: string; rows: { id: string; name: string; outlet: string | null; value: number }[]; unit: string }) => (
    <section className="card p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <table className="data"><thead><tr><th>#</th><th>Contact</th><th>Outlet</th><th className="text-right">{unit}</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={r.id}><td className="text-neutral-500">{i + 1}</td><td><Link href={`/contacts/${r.id}`} className="font-medium hover:underline">{r.name}</Link></td><td className="text-xs text-neutral-600">{r.outlet}</td><td className="text-right tabular-nums">{r.value.toLocaleString()}</td></tr>)}</tbody></table>
      {!rows.length && <p className="pt-2 text-sm text-neutral-500">No engagement recorded yet. Send a distribution first.</p>}
    </section>
  );
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div><h1 className="text-xl font-semibold">Contact Report</h1><p className="text-xs text-neutral-500">{d.total.toLocaleString()} active contacts</p></div>
        <a className="btn" href="/api/planning/contact-report.csv">Export engagement CSV</a>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Small title="By classification" rows={d.byClassification} href={(s) => `/contacts?cls=${encodeURIComponent(s)}`} />
        <Small title="By subject" rows={d.bySubject} href={(s) => `/contacts?subject=${encodeURIComponent(s)}`} />
        <Small title="By importance" rows={d.byImportance} labelFmt={pretty} href={(s) => `/contacts?imp=${s}`} />
        <Small title="By email status" rows={d.byEmailStatus} labelFmt={pretty} />
        <Small title="By audience location (top 15)" rows={d.byAudience} href={(s) => `/contacts?aud=${encodeURIComponent(s)}`} />
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Never emailed</h2>
          <p className="text-3xl font-semibold">{d.neverEmailed.toLocaleString()}</p>
          <p className="mt-1 text-sm text-neutral-600">contacts have never received a distribution.</p>
          <Link href="/contacts?emailOnly=true" className="btn mt-3">Open contacts with email</Link>
          <p className="mt-2 text-xs text-neutral-500">The contact list does not yet have a "never emailed" filter; build a list from the Smart Group screen or use the CSV export, which includes a sent count per contact.</p>
        </section>
        <Top title="Top 20 by opens" rows={d.topOpens} unit="Opens" />
        <Top title="Top 20 by replies" rows={d.topReplies} unit="Replies" />
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Significant updates, last 30 days ({d.updated.length})</h2>
          <ul className="divide-y divide-line text-sm">
            {d.updated.map((c) => <li key={c.id} className="py-1.5"><Link href={`/contacts/${c.id}`} className="font-medium hover:underline">{c.name}</Link>{c.outlet && <span className="text-xs text-neutral-500"> · {c.outlet}</span>}<span className="block text-xs text-warn">{c.note} <span className="text-neutral-400">{c.at?.toLocaleDateString()}</span></span></li>)}
            {!d.updated.length && <li className="py-2 text-neutral-500">No outlet or title changes recorded in the last 30 days.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
