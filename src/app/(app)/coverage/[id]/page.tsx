import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteCoverage, removePickup, updateCoverage } from "@/server/coverage";
import { titleCase } from "@/lib/coverage/filters";
import { CoverageForm } from "@/components/coverage/CoverageForm";
import { OutletMark, SentimentPill } from "@/components/coverage/CoverageTable";
import { PickupForm } from "@/components/coverage/PickupForm";
import { loadFormOptions } from "@/lib/coverage/options";

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

export default async function CoverageDetail({ params, searchParams }: { params: { id: string }; searchParams: { edit?: string } }) {
  const v = await requireViewer();
  const c = await db.coverage.findFirst({
    where: { id: params.id, accountId: v.account.id, deletedAt: null },
    include: { client: true, release: { select: { id: true, headline: true } }, organization: { select: { id: true, name: true, logoUrl: true } }, contact: { select: { id: true, firstName: true, lastName: true } }, tags: { include: { tag: true } } },
  });
  if (!c) notFound();
  const [pickups, author] = await Promise.all([
    db.coverage.findMany({ where: { parentId: c.id, accountId: v.account.id, deletedAt: null }, orderBy: { publishedAt: "desc" } }),
    db.user.findUnique({ where: { id: c.createdById }, select: { name: true } }),
  ]);
  const logo = c.organization?.logoUrl ?? c.outletLogoUrl ?? null;
  const ave = c.adValue == null ? null : Number(c.adValue);
  const backHref = c.parentId ? `/coverage/${c.parentId}` : "/coverage";

  if (searchParams.edit) {
    const options = await loadFormOptions(v.account.id);
    return (
      <div>
        <div className="mb-3 flex items-center gap-2"><Link href={`/coverage/${c.id}`} className="btn">← Back</Link><h1 className="text-xl font-semibold">Edit coverage</h1></div>
        <CoverageForm action={updateCoverage.bind(null, c.id)} options={options} submitLabel="Save changes" cancelHref={`/coverage/${c.id}`} defaults={{
          outletName: c.outletName, headline: c.headline, url: c.url ?? "", publishedAt: c.publishedAt.toISOString().slice(0, 10), type: c.type, focus: c.focus, sentiment: c.sentiment,
          summary: c.summary ?? "", notes: c.notes ?? "", estimatedReach: c.estimatedReach ?? "", adValue: ave ?? "", imageUrl: c.imageUrl ?? "", outletLogoUrl: c.outletLogoUrl ?? "",
          clientId: c.clientId ?? "", releaseId: c.releaseId ?? "", organizationId: c.organizationId ?? "", contactId: c.contactId ?? "", tagIds: c.tags.map((t: any) => t.tagId),
        }} />
      </div>
    );
  }

  const Card = ({ title, children, right, id }: { title: string; children: React.ReactNode; right?: React.ReactNode; id?: string }) => (
    <section className="card p-4" id={id}><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{title}</h2>{right}</div>{children}</section>
  );
  const Row = ({ k, val }: { k: string; val: React.ReactNode }) => <div className="flex justify-between gap-3 py-1 text-sm"><span className="text-neutral-500">{k}</span><span className="text-right">{val || <span className="text-neutral-300">—</span>}</span></div>;
  const reportQs = new URLSearchParams();
  if (c.clientId) reportQs.set("clientId", c.clientId);
  if (c.releaseId) reportQs.set("releaseId", c.releaseId);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Link href={backHref} className="btn">← {c.parentId ? "Original item" : "Coverage"}</Link>
        <Link href={`/coverage/${c.id}?edit=1`} className="btn">Edit</Link>
        <details className="relative ml-auto"><summary className="btn cursor-pointer list-none">⋯</summary>
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-line bg-white py-1 text-sm shadow-lg">
            <Link className="block px-3 py-1.5 hover:bg-neutral-50" href={`/coverage/${c.id}?edit=1`}>Edit</Link>
            <a className="block px-3 py-1.5 hover:bg-neutral-50" href={`/api/coverage/export.csv?ids=${c.id}`}>Export CSV</a>
            <a className="block px-3 py-1.5 hover:bg-neutral-50" href={`/api/coverage/report.pdf?${reportQs.toString()}`}>Add to report (PDF)</a>
            {c.url && <a className="block px-3 py-1.5 hover:bg-neutral-50" href={c.url} target="_blank" rel="noopener noreferrer">Open article ↗</a>}
            <form action={async () => { "use server"; await deleteCoverage([c.id]); redirect(backHref); }}>
              <button className="block w-full px-3 py-1.5 text-left text-bad hover:bg-red-50">Delete</button>
            </form>
          </div>
        </details>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <header className="card flex items-start gap-4 p-5">
            <OutletMark name={c.outletName} logoUrl={logo} size={12} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-600">{c.organization ? <Link href={`/organizations/${c.organization.id}`} className="hover:underline">{c.outletName}</Link> : c.outletName} · {c.publishedAt.toLocaleDateString()}{c.parentId && <span className="pill ml-2 bg-accentSoft text-accent">pickup</span>}</p>
              <h1 className="text-xl font-semibold">{c.headline}{c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-base text-neutral-400 hover:text-accent" aria-label="Open article in a new tab">↗</a>}</h1>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="pill bg-neutral-100 text-neutral-600">{titleCase(c.type)}</span>
                <span className="pill bg-neutral-100 text-neutral-600">{titleCase(c.focus)}</span>
                <SentimentPill s={c.sentiment} />
                {c.client && <span className="pill" style={{ background: c.client.color + "22", color: c.client.color }}>{c.client.name}</span>}
                {c.tags.map((t: any) => <span key={t.tagId} className="chip" style={{ background: t.tag.color + "22", color: t.tag.color }}>{t.tag.name}</span>)}
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {c.imageUrl && <img src={c.imageUrl} alt="" className="hidden h-24 w-36 rounded object-cover sm:block" />}
          </header>

          <Card title="Summary"><p className="whitespace-pre-wrap text-sm text-neutral-700">{c.summary ?? <span className="text-neutral-400">No summary.</span>}</p></Card>
          <Card title="Notes"><p className="whitespace-pre-wrap text-sm text-neutral-700">{c.notes ?? <span className="text-neutral-400">No internal notes.</span>}</p></Card>

          {!c.parentId && (
            <Card title={`Pickups (${pickups.length})`} id="pickups">
              <p className="mb-2 text-xs text-neutral-500">Syndicated or republished versions of this item. They count toward pickups on the list and in reports.</p>
              <ul className="mb-3 divide-y divide-line text-sm">
                {pickups.map((p: any) => (
                  <li key={p.id} className="flex items-center gap-3 py-1.5">
                    <OutletMark name={p.outletName} logoUrl={p.outletLogoUrl} size={6} />
                    <span className="min-w-0 flex-1"><Link href={`/coverage/${p.id}`} className="font-medium hover:underline">{p.outletName}</Link><span className="block truncate text-xs text-neutral-600">{p.headline}</span></span>
                    <span className="text-xs text-neutral-500">{p.publishedAt.toLocaleDateString()}</span>
                    {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-accent" aria-label="Open pickup">↗</a>}
                    <form action={async () => { "use server"; await removePickup(c.id, p.id); }}><button className="text-xs text-bad hover:underline" aria-label={`Remove pickup ${p.outletName}`}>Remove</button></form>
                  </li>
                ))}
                {!pickups.length && <li className="py-2 text-neutral-500">No pickups yet.</li>}
              </ul>
              <PickupForm parentId={c.id} />
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card title="Reach">
            <Row k="Estimated reach" val={c.estimatedReach?.toLocaleString()} />
            <Row k="AVE" val={ave == null ? null : money(ave)} />
            <Row k="Pickups" val={c.pickupCount || null} />
          </Card>
          <Card title="Linked">
            <Row k="Client" val={c.client && <span className="flex items-center justify-end gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.client.color }} />{c.client.name}</span>} />
            <Row k="Release" val={c.release && <Link href={`/releases/${c.release.id}`} className="hover:underline">{c.release.headline}</Link>} />
            <Row k="Organization" val={c.organization && <Link href={`/organizations/${c.organization.id}`} className="hover:underline">{c.organization.name}</Link>} />
            <Row k="Journalist" val={c.contact && <Link href={`/contacts/${c.contact.id}`} className="hover:underline">{c.contact.firstName} {c.contact.lastName}</Link>} />
            {c.parentId && <Row k="Pickup of" val={<Link href={`/coverage/${c.parentId}`} className="hover:underline">Original item</Link>} />}
          </Card>
          <Card title="Record">
            <Row k="Logged by" val={author?.name} />
            <Row k="Logged" val={c.createdAt.toLocaleString()} />
            <Row k="Updated" val={c.updatedAt.toLocaleString()} />
          </Card>
          <div className="flex flex-wrap gap-2 text-xs">
            <a className="btn" href={`/api/coverage/report.pdf?${reportQs.toString()}`}>Add to report</a>
            {c.releaseId && <Link className="btn" href={`/coverage?release=${c.releaseId}`}>All coverage for this release</Link>}
          </div>
        </aside>
      </div>
    </div>
  );
}
