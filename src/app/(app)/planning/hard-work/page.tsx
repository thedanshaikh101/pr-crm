import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayKey, rangeFor } from "@/lib/planning/agg";
import { HARD_WORK_METRICS, hardWorkRows, hardWorkTotals, type HardWorkMetric } from "@/lib/planning/hardWork";
import { RangeControls } from "@/components/planning/RangeControls";

export default async function HardWorkPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const v = await requireViewer();
  const sp = (k: string) => { const x = searchParams[k]; return Array.isArray(x) ? x[0] : x; };
  const range = rangeFor(sp("preset"), sp("from"), sp("to"));
  const clientId = sp("client") || "";
  const metric = (HARD_WORK_METRICS.some(([k]) => k === sp("metric")) ? sp("metric") : "coverageLogged") as HardWorkMetric;
  const [clients, rows] = await Promise.all([
    db.client.findMany({ where: { accountId: v.account.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    hardWorkRows(v.account.id, range.from, range.to, clientId || null),
  ]);
  const totals = hardWorkTotals(rows);
  const max = Math.max(1, ...rows.map((r) => r[metric]));
  const qs = new URLSearchParams({ from: dayKey(range.from), to: dayKey(range.to) });
  if (clientId) qs.set("client", clientId);
  const metricHref = (m: string) => `/planning/hard-work?${new URLSearchParams({ ...Object.fromEntries(qs), metric: m }).toString()}`;
  const metricLabel = HARD_WORK_METRICS.find(([k]) => k === metric)![1];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your Hard Work</h1>
        <a className="btn" href={`/api/planning/hard-work.csv?${qs.toString()}`}>Export CSV</a>
      </div>
      <RangeControls base="/planning/hard-work" from={dayKey(range.from)} to={dayKey(range.to)} preset={range.preset} clientId={clientId} clients={clients} extra={{ metric }} />

      <section className="card mb-4 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">By teammate</h2>
          <select className="input ml-auto w-56" aria-label="Metric" defaultValue={metric} form="metric-form" name="metric">{HARD_WORK_METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <form id="metric-form" method="get" action="/planning/hard-work">{Array.from(qs.entries()).map(([k, val]) => <input key={k} type="hidden" name={k} value={val} />)}<button className="btn">Show</button></form>
        </div>
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.userId} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-2 text-sm">
              <span className="truncate">{r.name}</span>
              <span className="h-4 rounded bg-neutral-100"><span className="block h-4 rounded bg-accent" style={{ width: `${(r[metric] / max) * 100}%` }} title={`${r.name}: ${r[metric]}`} /></span>
              <span className="text-right font-medium">{r[metric].toLocaleString()}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-neutral-500">{metricLabel}, {range.from.toLocaleDateString()} to {range.to.toLocaleDateString()}. Quick pick: {HARD_WORK_METRICS.map(([k, l]) => <Link key={k} href={metricHref(k)} className={`mr-2 ${k === metric ? "font-semibold text-accent" : "underline"}`}>{l}</Link>)}</p>
      </section>

      <div className="card overflow-x-auto">
        <table className="data">
          <thead><tr><th>Teammate</th><th>Role</th>{HARD_WORK_METRICS.map(([k, l]) => <th key={k} className="text-right"><Link href={metricHref(k)} className={k === metric ? "text-accent" : ""}>{l}</Link></th>)}</tr></thead>
          <tbody>
            {rows.map((r) => <tr key={r.userId}><td className="font-medium">{r.name}<span className="block text-xs font-normal text-neutral-500">{r.jobTitle ?? r.email}</span></td><td className="text-xs">{r.role.toLowerCase()}</td>{HARD_WORK_METRICS.map(([k]) => <td key={k} className="text-right tabular-nums">{r[k].toLocaleString()}</td>)}</tr>)}
            <tr className="bg-neutral-50 font-semibold"><td>Total</td><td /> {HARD_WORK_METRICS.map(([k]) => <td key={k} className="text-right tabular-nums">{totals[k].toLocaleString()}</td>)}</tr>
          </tbody>
        </table>
        {!rows.length && <p className="p-4 text-sm text-neutral-500">No teammates in this account yet.</p>}
      </div>
      <p className="mt-2 text-xs text-neutral-500">Statements written counts audit entries for statement changes. Conversations handled counts enquiries assigned in the range.</p>
    </div>
  );
}
