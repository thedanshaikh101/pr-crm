import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDomain, deleteDomain, setDefaultFrom, verifyDomain } from "@/server/domains";
import { CopyButton } from "@/components/releases/CopyButton";
import { StatusPill } from "@/components/releases/StatusPill";

export default async function DomainsPage({ searchParams }: { searchParams: { d?: string; msg?: string } }) {
  const v = await requireViewer();
  const domains = await db.sendingDomain.findMany({ where: { accountId: v.account.id }, orderBy: { createdAt: "asc" } });
  const isAdmin = v.role === "ADMIN" || v.role === "OWNER";
  const selected = domains.find((d: any) => d.id === searchParams.d) ?? domains[0] ?? null;
  const records = ((selected?.dnsRecords as any[]) ?? []) as { type: string; name: string; value: string; verified?: boolean }[];
  return (
    <div>
      <h1 className="text-xl font-semibold">Sending Domains</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600">Live distributions can only be sent from an address on a verified domain. Add the domain you send from, publish the DNS records it gives you, then verify. Test sends and previews work without one, but Send now and Schedule refuse unverified from addresses.</p>
      {searchParams.msg && <p className="mt-3 rounded bg-accentSoft px-3 py-2 text-sm text-accent">{searchParams.msg}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-3">
          <div className="card divide-y divide-line">
            {domains.map((d: any) => (
              <Link key={d.id} href={`/settings/domains?d=${d.id}`} className={`block p-3 hover:bg-neutral-50 ${selected?.id === d.id ? "bg-accentSoft/40" : ""}`}>
                <div className="flex items-center justify-between"><span className="font-medium">{d.domain}</span><StatusPill status={d.status} /></div>
                <p className="mt-1 text-xs text-neutral-500">Added {d.createdAt.toLocaleDateString()}{d.verifiedAt ? ` · verified ${d.verifiedAt.toLocaleDateString()}` : ""}</p>
                <p className="text-xs text-neutral-500">{d.defaultFrom ? `From: ${d.defaultFrom}` : "No default from address"}</p>
              </Link>
            ))}
            {!domains.length && <p className="p-4 text-sm text-neutral-500">No sending domains yet.</p>}
          </div>
          {isAdmin ? (
            <form action={addDomain} className="card space-y-2 p-4">
              <label className="label" htmlFor="domain">Add a domain</label>
              <input id="domain" name="domain" className="input" placeholder="news.yourcompany.com" required pattern="[A-Za-z0-9.-]+\.[A-Za-z]{2,}" />
              <p className="text-xs text-neutral-500">Use a subdomain you do not use for regular mail, so bounces and reputation stay separate.</p>
              <button className="btn btn-primary">Add domain</button>
            </form>
          ) : <p className="text-xs text-neutral-500">Only admins can add or change sending domains.</p>}
        </div>

        {selected ? (
          <div className="space-y-4">
            <section className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{selected.domain}</h2><StatusPill status={selected.status} />
                <span className="flex-1" />
                {isAdmin && <form action={verifyDomain.bind(null, selected.id)}><button className="btn btn-primary">{selected.status === "VERIFIED" ? "Verify again" : "Verify"}</button></form>}
                {isAdmin && <form action={deleteDomain.bind(null, selected.id)}><button className="btn btn-danger">Delete</button></form>}
              </div>
              <p className="mt-2 text-xs text-neutral-500">{selected.status === "VERIFIED" ? `Verified ${selected.verifiedAt?.toLocaleString()}.` : selected.status === "FAILED" ? "Verification failed. Check the records below and try again." : "Publish these DNS records at your DNS host, wait for them to propagate, then verify."}</p>
            </section>
            <section className="card overflow-x-auto">
              <div className="border-b border-line px-3 py-2 text-sm font-semibold">DNS records</div>
              {records.length ? (
                <table className="data"><thead><tr><th>Type</th><th>Name</th><th>Value</th><th>Verified</th><th></th></tr></thead>
                  <tbody>{records.map((r, i) => (
                    <tr key={i}><td className="font-mono text-xs">{r.type}</td><td className="font-mono text-xs">{r.name}</td><td className="max-w-md break-all font-mono text-xs">{r.value}</td><td>{r.verified ? <span className="text-good">yes</span> : <span className="text-neutral-400">not yet</span>}</td><td><CopyButton value={r.value} /></td></tr>
                  ))}</tbody></table>
              ) : <p className="p-4 text-sm text-neutral-500">No records recorded for this domain.</p>}
            </section>
            <section className="card p-4">
              <h3 className="text-sm font-semibold">Default from address</h3>
              <p className="mb-2 text-xs text-neutral-500">Offered first when distributing. Must end with @{selected.domain}.</p>
              {isAdmin ? (
                <form action={setDefaultFrom.bind(null, selected.id)} className="flex gap-2">
                  <input name="defaultFrom" type="email" className="input" defaultValue={selected.defaultFrom ?? ""} placeholder={`media@${selected.domain}`} />
                  <button className="btn">Save</button>
                </form>
              ) : <p className="text-sm">{selected.defaultFrom ?? "Not set"}</p>}
            </section>
          </div>
        ) : (
          <div className="card p-10 text-center text-sm text-neutral-600">Add a domain to see its DNS records here.</div>
        )}
      </div>
    </div>
  );
}
