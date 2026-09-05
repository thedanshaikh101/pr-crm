import Link from "next/link";

/** Shared date range + client filter row for the planning screens. Server component; plain GET form. */
export function RangeControls({ base, from, to, preset, clientId, clients, extra }: {
  base: string; from: string; to: string; preset?: string; clientId: string; clients: { id: string; name: string }[]; extra?: Record<string, string>;
}) {
  const href = (p: string) => { const q = new URLSearchParams({ ...(extra ?? {}), preset: p }); if (clientId) q.set("client", clientId); return `${base}?${q.toString()}`; };
  return (
    <form method="get" action={base} className="mb-4 flex flex-wrap items-end gap-2">
      {Object.entries(extra ?? {}).map(([k, val]) => <input key={k} type="hidden" name={k} value={val} />)}
      <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="Range presets">
        {[["30d", "30 days"], ["90d", "90 days"], ["12m", "12 months"]].map(([p, l]) => <Link key={p} href={href(p)} className={`px-2.5 py-1.5 text-sm ${preset === p ? "bg-accentSoft text-accent" : "bg-white hover:bg-neutral-50"}`}>{l}</Link>)}
      </div>
      <div><label className="label" htmlFor="rc-from">From</label><input id="rc-from" type="date" name="from" className="input" defaultValue={from} /></div>
      <div><label className="label" htmlFor="rc-to">To</label><input id="rc-to" type="date" name="to" className="input" defaultValue={to} /></div>
      <div><label className="label" htmlFor="rc-client">Client</label><select id="rc-client" name="client" className="input w-44" defaultValue={clientId}><option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <button className="btn">Apply</button>
    </form>
  );
}
