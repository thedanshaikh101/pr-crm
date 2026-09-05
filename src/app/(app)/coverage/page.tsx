import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeFilterCount, buildCoverageWhere, DEFAULT_COLUMNS, orderFor, parseFilters, toQuery } from "@/lib/coverage/filters";
import { ListToolbar } from "@/components/ListToolbar";
import { CoverageFilterDrawer } from "@/components/coverage/CoverageFilterDrawer";
import { CoverageTable, type CoverageRow } from "@/components/coverage/CoverageTable";

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

export default async function CoveragePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const v = await requireViewer();
  const f = parseFilters(searchParams);
  const where = buildCoverageWhere(f, v.account.id);
  const [total, rows, agg, bySentiment, clients, releases, tags, orgs, contacts, layout, savedViews] = await Promise.all([
    db.coverage.count({ where }),
    db.coverage.findMany({
      where, orderBy: orderFor(f.sort), skip: (f.page - 1) * f.per, take: f.per,
      include: { client: { select: { id: true, name: true, color: true } }, release: { select: { id: true, headline: true } }, organization: { select: { id: true, logoUrl: true } }, tags: { include: { tag: true } } },
    }),
    db.coverage.aggregate({ where, _sum: { estimatedReach: true, adValue: true, pickupCount: true } }),
    db.coverage.groupBy({ by: ["sentiment"], where, _count: { _all: true } }),
    db.client.findMany({ where: { accountId: v.account.id }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    db.release.findMany({ where: { accountId: v.account.id, deletedAt: null }, select: { id: true, headline: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.tag.findMany({ where: { accountId: v.account.id }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    db.organization.findMany({ where: { accountId: v.account.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    db.contact.findMany({ where: { accountId: v.account.id, deletedAt: null }, select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: "asc" }, take: 2000 }),
    db.columnLayout.findUnique({ where: { userId_screen: { userId: v.user.id, screen: "coverage" } } }),
    db.savedView.findMany({ where: { accountId: v.account.id, screen: "coverage", OR: [{ userId: v.user.id }, { shared: true }] } }),
  ]);
  const columns = (layout?.columns as typeof DEFAULT_COLUMNS | undefined) ?? DEFAULT_COLUMNS;
  const from = total ? (f.page - 1) * f.per + 1 : 0;
  const to = Math.min(total, f.page * f.per);
  const pages = Math.max(1, Math.ceil(total / f.per));
  const sentiment = (s: string) => bySentiment.find((x: any) => x.sentiment === s)?._count._all ?? 0;
  const reportQuery = new URLSearchParams();
  if (f.client.length === 1) reportQuery.set("clientId", f.client[0]);
  if (f.release.length === 1) reportQuery.set("releaseId", f.release[0]);
  if (f.from) reportQuery.set("from", f.from);
  if (f.to) reportQuery.set("to", f.to);
  const reportHref = `/api/coverage/report.pdf?${reportQuery.toString()}`;
  const csvHref = `/api/coverage/export.csv${toQuery(f)}`;
  const filtered = activeFilterCount(f) > 0 || !!f.q;

  const data: CoverageRow[] = rows.map((c: any) => ({
    id: c.id, outlet: c.outletName, logoUrl: c.organization?.logoUrl ?? c.outletLogoUrl ?? null, orgId: c.organization?.id ?? null, headline: c.headline, url: c.url,
    publishedAt: c.publishedAt.toISOString(), type: c.type, focus: c.focus, sentiment: c.sentiment, client: c.client, release: c.release,
    reach: c.estimatedReach, ave: c.adValue == null ? null : Number(c.adValue), pickups: c.pickupCount, tags: c.tags.map((t: any) => t.tag), imageUrl: c.imageUrl, summary: c.summary,
  }));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Coverage</h1>
        <div className="flex gap-2">
          <a href={csvHref} className="btn">Export CSV</a>
          <details className="relative">
            <summary className="btn cursor-pointer list-none">Download PDF report ▾</summary>
            <div className="absolute right-0 z-20 mt-1 w-64 rounded-md border border-line bg-white py-1 text-sm shadow-lg">
              <a className="block px-3 py-1.5 hover:bg-neutral-50" href={reportHref}>Current filters{f.from || f.to ? ` (${f.from ?? "start"} to ${f.to ?? "today"})` : ""}</a>
              <p className="border-t border-line px-3 pb-0.5 pt-1.5 text-xs text-neutral-500">Per client</p>
              {clients.map((c: any) => <a key={c.id} className="block px-3 py-1.5 hover:bg-neutral-50" href={`/api/coverage/report.pdf?clientId=${c.id}${f.from ? `&from=${f.from}` : ""}${f.to ? `&to=${f.to}` : ""}`}><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />{c.name}</a>)}
              {!clients.length && <p className="px-3 py-1.5 text-xs text-neutral-500">No clients yet.</p>}
            </div>
          </details>
          <Link href="/coverage/new" className="btn btn-primary">Add coverage</Link>
        </div>
      </div>

      <ListToolbar
        screen="coverage" q={f.q ?? ""} filterCount={activeFilterCount(f)} view={f.view} total={total} from={from} to={to} page={f.page} pages={pages} per={f.per}
        basePath="/coverage" query={toQuery(f)} placeholder="Search headline, outlet, summary" resetHref="/coverage" columns={columns}
        savedViews={savedViews.map((s: any) => ({ id: s.id, name: s.name, params: s.params }))} currentQuery={toQuery(f)}
        drawer={<CoverageFilterDrawer f={f} clients={clients} releases={releases.map((r: any) => ({ id: r.id, name: r.headline }))} tags={tags} orgs={orgs} contacts={contacts.map((c: any) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim() }))} />}
      />

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="card px-3 py-2"><p className="text-xs text-neutral-500">Items</p><p className="text-lg font-semibold">{total.toLocaleString()}</p></div>
        <div className="card px-3 py-2"><p className="text-xs text-neutral-500">Total reach</p><p className="text-lg font-semibold">{(agg._sum.estimatedReach ?? 0).toLocaleString()}</p></div>
        <div className="card px-3 py-2"><p className="text-xs text-neutral-500">Total AVE</p><p className="text-lg font-semibold">{money(Number(agg._sum.adValue ?? 0))}</p></div>
        <div className="card px-3 py-2"><p className="text-xs text-neutral-500">Sentiment</p><p className="flex gap-3 text-sm font-semibold"><span className="text-good" title="Positive">▲ {sentiment("POSITIVE")}</span><span className="text-neutral-500" title="Neutral">● {sentiment("NEUTRAL")}</span><span className="text-bad" title="Negative">▼ {sentiment("NEGATIVE")}</span></p></div>
      </div>

      <CoverageTable rows={data} columns={columns} view={f.view} clients={clients} />

      {!total && (
        <div className="card mt-4 p-10 text-center">
          <p className="mb-1 font-medium">{filtered ? "No coverage matches these filters." : "No coverage logged yet."}</p>
          <p className="mb-4 text-sm text-neutral-600">{filtered ? "Loosen a filter or clear the search." : "Paste an article URL and Pressdesk fills in the outlet, headline, date and image."}</p>
          {filtered ? <Link href="/coverage" className="btn">Clear filters</Link> : <Link href="/coverage/new" className="btn btn-primary">Add coverage</Link>}
        </div>
      )}

      <Link href="/coverage/new" className="fixed bottom-6 right-6 grid h-12 w-12 place-items-center rounded-full bg-accent text-2xl text-white shadow-lg" aria-label="Add coverage">+</Link>
    </div>
  );
}
