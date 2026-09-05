import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { ListToolbar } from "@/components/ListToolbar";
import { activeReleaseFilterCount, buildReleaseWhere, parseReleaseFilters, releaseOrderFor, toReleaseQuery } from "@/lib/releases/filters";
import { basePath, kindLabel, pct, releaseExcerpt, statsByRelease, type Kind } from "@/lib/releases/data";
import { archiveRelease, deleteRelease, duplicateRelease } from "@/server/releases";
import { ReleaseFilterDrawer } from "./ReleaseFilterDrawer";
import { ClientDot, StatusPill } from "./StatusPill";

export async function ReleaseListPage({ kind, searchParams }: { kind: Kind; searchParams: Record<string, string | string[] | undefined> }) {
  const v = await requireViewer();
  const f = parseReleaseFilters(searchParams);
  const base = basePath(kind);
  const where = buildReleaseWhere(f, v.account.id, kind);
  const [total, rows, clients, tags] = await Promise.all([
    db.release.count({ where }),
    db.release.findMany({ where, orderBy: releaseOrderFor(f.sort), skip: (f.page - 1) * f.per, take: f.per, include: { client: { select: { id: true, name: true, color: true } }, tags: { include: { tag: { select: { id: true, name: true, color: true } } } } } }),
    db.client.findMany({ where: { accountId: v.account.id }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    db.tag.findMany({ where: { accountId: v.account.id, releases: { some: {} } }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
  ]);
  const stats = await statsByRelease(rows.map((r: any) => r.id));
  const from = total ? (f.page - 1) * f.per + 1 : 0;
  const to = Math.min(total, f.page * f.per);
  const pages = Math.max(1, Math.ceil(total / f.per));
  const filtered = activeReleaseFilterCount(f) > 0 || !!f.q;
  const empty = { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, unsubscribed: 0 };

  const Tiles = ({ id, pageviews }: { id: string; pageviews: number }) => {
    const s = stats[id] ?? empty;
    const T = ({ k, val }: { k: string; val: React.ReactNode }) => <div className="rounded bg-neutral-50 px-2 py-1 text-center"><div className="text-sm font-semibold">{val}</div><div className="text-[10px] uppercase tracking-wide text-neutral-500">{k}</div></div>;
    return (
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
        <T k="Sent" val={s.sent} /><T k="Delivered" val={`${pct(s.delivered, s.sent)}%`} /><T k="Opened" val={`${pct(s.opened, s.delivered)}%`} /><T k="Clicked" val={s.clicked} /><T k="Replied" val={s.replied} /><T k="Pageviews" val={pageviews} />
      </div>
    );
  };
  const Actions = ({ id }: { id: string }) => (
    <details className="relative"><summary className="btn cursor-pointer list-none px-2 py-0.5 text-xs" aria-label="Row actions">⋯</summary>
      <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-line bg-white py-1 text-sm shadow-lg">
        <Link className="block px-3 py-1.5 hover:bg-neutral-50" href={`${base}/${id}/edit`}>Edit</Link>
        <Link className="block px-3 py-1.5 hover:bg-neutral-50" href={`${base}/${id}/distribute`}>Distribute</Link>
        <form action={duplicateRelease.bind(null, id)}><button className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50">Duplicate</button></form>
        <form action={archiveRelease.bind(null, id)}><button className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50">Archive</button></form>
        <form action={deleteRelease.bind(null, id)}><button className="block w-full px-3 py-1.5 text-left text-bad hover:bg-red-50">Delete</button></form>
      </div>
    </details>
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{kindLabel(kind, true)}</h1>
        <Link href={`${base}/new`} className="btn btn-primary">New {kindLabel(kind).toLowerCase()}</Link>
      </div>
      <ListToolbar
        screen={kind === "NEWSLETTER" ? "newsletters" : "releases"} q={f.q ?? ""} filterCount={activeReleaseFilterCount(f)} view={f.view}
        total={total} from={from} to={to} page={f.page} pages={pages} per={f.per}
        hrefFor={(patch) => `${base}${toReleaseQuery({ ...f, ...patch })}`} resetHref={base} currentQuery={toReleaseQuery(f)}
        drawer={<ReleaseFilterDrawer f={f} base={base} clients={clients} tags={tags} />}
      />

      {f.view === "cards" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r: any) => (
            <article key={r.id} className="card flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <StatusPill status={r.status} /><Actions id={r.id} />
              </div>
              <h2 className="font-semibold leading-snug"><Link href={`${base}/${r.id}`} className="hover:underline">{r.headline}</Link></h2>
              <p className="line-clamp-2 text-xs text-neutral-600">{releaseExcerpt(r, 140)}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                <ClientDot client={r.client} />
                <span>· {r.proactivity === "UNSET" ? "proactivity unset" : r.proactivity.toLowerCase()}</span>
                <span>· {(r.publishedAt ?? r.updatedAt).toLocaleDateString()}</span>
              </div>
              {r.tags.length > 0 && <div className="flex flex-wrap gap-1">{r.tags.map((t: any) => <span key={t.tagId} className="chip" style={{ background: t.tag.color + "22", color: t.tag.color }}>{t.tag.name}</span>)}</div>}
              <Tiles id={r.id} pageviews={r.pageviews} />
            </article>
          ))}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data"><thead><tr><th>Headline</th><th>Status</th><th>Client</th><th>Proactivity</th><th>Sent</th><th>Delivered</th><th>Opened</th><th>Clicked</th><th>Replied</th><th>Pageviews</th><th>Updated</th><th></th></tr></thead>
            <tbody>{rows.map((r: any) => { const s = stats[r.id] ?? empty; return (
              <tr key={r.id}>
                <td><Link href={`${base}/${r.id}`} className="font-medium hover:underline">{r.headline}</Link>{r.tags.length > 0 && <div className="mt-0.5 flex flex-wrap gap-1">{r.tags.map((t: any) => <span key={t.tagId} className="chip" style={{ background: t.tag.color + "22", color: t.tag.color }}>{t.tag.name}</span>)}</div>}</td>
                <td><StatusPill status={r.status} /></td><td><ClientDot client={r.client} /></td><td className="text-xs">{r.proactivity.toLowerCase()}</td>
                <td>{s.sent}</td><td>{pct(s.delivered, s.sent)}%</td><td>{pct(s.opened, s.delivered)}%</td><td>{s.clicked}</td><td>{s.replied}</td><td>{r.pageviews}</td>
                <td className="text-xs text-neutral-500">{r.updatedAt.toLocaleDateString()}</td><td><Actions id={r.id} /></td>
              </tr>); })}</tbody></table>
        </div>
      )}

      {!total && (
        <div className="card mt-4 p-10 text-center">
          <p className="mb-1 font-medium">{filtered ? `No ${kindLabel(kind, true).toLowerCase()} match these filters.` : `No ${kindLabel(kind, true).toLowerCase()} yet.`}</p>
          <p className="mb-4 text-sm text-neutral-600">{filtered ? "Loosen a filter or clear the search." : kind === "NEWSLETTER" ? "Build a newsletter from blocks and send it to a list." : "Write your first release, then distribute it to a list or publish it to the newsroom."}</p>
          {!filtered && <Link href={`${base}/new`} className="btn btn-primary">New {kindLabel(kind).toLowerCase()}</Link>}
        </div>
      )}
      <Link href={`${base}/new`} className="fixed bottom-6 right-6 grid h-12 w-12 place-items-center rounded-full bg-accent text-2xl text-white shadow-lg" aria-label={`New ${kindLabel(kind).toLowerCase()}`}>+</Link>
    </div>
  );
}
