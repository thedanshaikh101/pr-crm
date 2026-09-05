import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { basePath, buildRenderInput, newsroomUrl, pct, readMediaContactId, recipientWhereFor, RELEASE_INCLUDE, shortUrl, statsByRelease, WHO_KEYS, type Kind, type Who } from "@/lib/releases/data";
import { renderReleaseHtml } from "@/lib/releases/render";
import { archiveRelease, deleteRelease, duplicateRelease, publishRelease } from "@/server/releases";
import { cancelDistribution, createListFromRecipients } from "@/server/distributions";
import { CopyButton } from "./CopyButton";
import { PreviewFrame } from "./PreviewFrame";
import { ClientDot, StatusPill } from "./StatusPill";

export async function ReleaseDetail({ kind, id, searchParams }: { kind: Kind; id: string; searchParams: Record<string, string | undefined> }) {
  const v = await requireViewer();
  const r = await db.release.findFirst({ where: { id, accountId: v.account.id, deletedAt: null }, include: { ...RELEASE_INCLUDE, distributions: { orderBy: { createdAt: "desc" }, include: { _count: { select: { recipients: true } } } }, coverage: { where: { deletedAt: null }, orderBy: { publishedAt: "desc" }, take: 20 }, _count: { select: { versions: true } } } });
  if (!r) notFound();
  if (r.kind !== kind) redirect(`${basePath(r.kind as Kind)}/${id}`);
  const base = basePath(kind);
  const tab = searchParams.tab === "information" ? "information" : "distribution";
  const who = (WHO_KEYS.includes(searchParams.who as Who) ? searchParams.who : "all") as Who;
  const dists = r.distributions as any[];
  const selected = dists.find((d) => d.id === searchParams.dist) ?? dists.find((d) => !d.isTest) ?? dists[0] ?? null;
  const [stats, recipients, opensByDist, users, bpRows] = await Promise.all([
    statsByRelease([r.id]).then((s) => s[r.id] ?? { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, unsubscribed: 0 }),
    selected ? db.distributionRecipient.findMany({ where: { distributionId: selected.id, ...recipientWhereFor(who) }, orderBy: { id: "asc" }, take: 500 }) : Promise.resolve([]),
    dists.length ? db.distributionRecipient.groupBy({ by: ["distributionId"], where: { distributionId: { in: dists.map((d) => d.id) } }, _count: { firstOpenAt: true } }) : Promise.resolve([] as any[]),
    db.user.findMany({ where: { id: { in: [r.createdById, r.updatedById].filter(Boolean) as string[] } }, select: { id: true, name: true } }),
    db.boilerplate.findMany({ where: { accountId: v.account.id, id: { in: [r.boilerplateId, r.footerId, readMediaContactId(r.blocks)].filter(Boolean) as string[] } }, select: { id: true, name: true, kind: true } }),
  ]);
  const opens = (did: string) => (opensByDist as any[]).find((x) => x.distributionId === did)?._count.firstOpenAt ?? 0;
  const userName = (uid: string | null) => users.find((u: any) => u.id === uid)?.name ?? "Unknown";
  const bpName = (bid: string | null) => bpRows.find((b: any) => b.id === bid)?.name ?? null;
  const summary = searchParams.s?.split(",").map(Number);
  const showPreview = searchParams.preview === "1";
  let preview: { email: string; newsroom: string } | null = null;
  if (showPreview) {
    const input = await buildRenderInput(v.account.id, r);
    preview = {
      email: renderReleaseHtml(input, { mode: "email", accountName: v.account.name, unsubscribeUrl: "#", wrapper: { newsroomUrl: newsroomUrl(v.account.slug, r.slug) } }),
      newsroom: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Inter,system-ui,sans-serif;margin:24px;color:#1C1F26;} img{max-width:100%;}</style></head><body>${renderReleaseHtml(input, { mode: "newsroom" })}</body></html>`,
    };
  }
  const q = (patch: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, val] of Object.entries({ tab, dist: selected?.id, who, preview: showPreview ? "1" : undefined, ...patch })) if (val) p.set(k, val); return `${base}/${r.id}?${p}`; };
  const Tile = ({ k, val, sub }: { k: string; val: React.ReactNode; sub?: string }) => <div className="card p-3 text-center"><div className="text-xl font-semibold">{val}</div><div className="text-xs text-neutral-600">{k}</div>{sub && <div className="text-[10px] text-neutral-400">{sub}</div>}</div>;
  const Row = ({ k, val }: { k: string; val: React.ReactNode }) => <div className="flex justify-between gap-3 py-1 text-sm"><span className="text-neutral-500">{k}</span><span className="text-right">{val || <span className="text-neutral-300">none</span>}</span></div>;
  const recipStatus = (x: any) => x.bouncedAt ? `bounced (${x.bounceType ?? "hard"})` : x.droppedAt ? "dropped" : x.blockedAt ? "blocked" : x.complainedAt ? "complained" : x.unsubscribedAt ? "unsubscribed" : x.error ? "error" : x.deliveredAt ? "delivered" : x.providerMsgId ? "sent" : "queued";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={base} className="btn">← Back</Link>
        <Link href={`${base}/${r.id}/edit`} className="btn">Edit</Link>
        <Link href={`${base}/${r.id}/distribute`} className="btn btn-primary">Distribute</Link>
        <Link href={q({ preview: showPreview ? undefined : "1" })} className={`btn ${showPreview ? "bg-accentSoft text-accent" : ""}`}>Preview</Link>
        <details className="relative ml-auto"><summary className="btn cursor-pointer list-none">⋯</summary>
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-line bg-white py-1 text-sm shadow-lg">
            {r.status !== "LIVE" && <form action={publishRelease.bind(null, r.id)}><button className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50">Publish to newsroom</button></form>}
            <form action={duplicateRelease.bind(null, r.id)}><button className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50">Duplicate</button></form>
            <Link className="block px-3 py-1.5 hover:bg-neutral-50" href={`${base}/${r.id}/versions`}>Versions ({r._count.versions})</Link>
            <form action={archiveRelease.bind(null, r.id)}><button className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50">Archive</button></form>
            <form action={deleteRelease.bind(null, r.id)}><button className="block w-full px-3 py-1.5 text-left text-bad hover:bg-red-50">Delete</button></form>
          </div>
        </details>
      </div>

      <header className="card mb-4 p-5">
        <div className="flex flex-wrap items-center gap-2"><StatusPill status={r.status} /><ClientDot client={r.client} /><span className="text-xs text-neutral-500">· {r.proactivity === "UNSET" ? "proactivity not set" : r.proactivity.toLowerCase()}</span>{r.embargoUntil && r.embargoUntil > new Date() && <span className="pill bg-amber-50 text-warn">embargo until {r.embargoUntil.toLocaleString()}</span>}</div>
        <h1 className="mt-2 text-2xl font-semibold leading-tight">{r.headline}</h1>
        {r.subheadline && <p className="mt-1 text-neutral-600">{r.subheadline}</p>}
        <p className="mt-2 text-xs text-neutral-500">{r.publishedAt ? `Published ${r.publishedAt.toLocaleString()}` : r.scheduledFor ? `Scheduled ${r.scheduledFor.toLocaleString()}` : `Updated ${r.updatedAt.toLocaleString()}`}</p>
      </header>

      {searchParams.queued === "0" && <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-warn">The worker queue is unavailable right now. The distribution is saved as queued and will send once the worker picks it up.</p>}
      {summary && summary.length === 4 && <p className="mb-3 rounded bg-green-50 px-3 py-2 text-sm text-good">Distribution created: {summary[0]} unique recipients, {summary[1]} without a valid email, {summary[2]} suppressed, {summary[3]} being sent.</p>}
      {showPreview && <div className="mb-4"><PreviewFrame html={preview} /></div>}

      <div className="mb-3 flex gap-1 text-sm">{[["distribution", "Distribution"], ["information", "Information"]].map(([k, l]) => <Link key={k} href={q({ tab: k })} className={`rounded px-3 py-1.5 ${tab === k ? "bg-accentSoft font-medium text-accent" : "hover:bg-neutral-100"}`}>{l}</Link>)}</div>

      {tab === "distribution" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Tile k="Sent" val={stats.sent} /><Tile k="Delivered" val={stats.delivered} sub={`${pct(stats.delivered, stats.sent)}%`} /><Tile k="Opened" val={`${pct(stats.opened, stats.delivered)}%`} sub={`${stats.opened} recipients`} /><Tile k="Clicked" val={stats.clicked} /><Tile k="Replied" val={stats.replied} /><Tile k="Bounced" val={stats.bounced} /><Tile k="Unsubscribed" val={stats.unsubscribed} /><Tile k="Pageviews" val={r.pageviews} sub="newsroom" />
          </div>
          <section className="card overflow-x-auto">
            <div className="border-b border-line px-3 py-2 text-sm font-semibold">Distributions</div>
            {dists.length ? (
              <table className="data"><thead><tr><th>Label</th><th>Status</th><th>Scheduled</th><th>Started</th><th>Completed</th><th>Recipients</th><th>Opens</th><th></th></tr></thead>
                <tbody>{dists.map((d) => (
                  <tr key={d.id} className={selected?.id === d.id ? "bg-accentSoft/40" : ""}>
                    <td><Link href={q({ dist: d.id })} className="font-medium hover:underline">{d.label}</Link>{d.isTest && <span className="pill ml-1 bg-neutral-100 text-neutral-600">test</span>}{d.status === "QUEUED" && !d.jobId && <span className="pill ml-1 bg-amber-50 text-warn" title="No worker job id; the queue was unavailable when this was created">no job</span>}</td>
                    <td><StatusPill status={d.status} /></td>
                    <td className="text-xs">{d.scheduledFor?.toLocaleString() ?? ""}</td><td className="text-xs">{d.startedAt?.toLocaleString() ?? ""}</td><td className="text-xs">{d.completedAt?.toLocaleString() ?? ""}</td>
                    <td>{d.recipientCount || d._count.recipients}</td><td>{opens(d.id)}</td>
                    <td>{d.status === "QUEUED" && !d.startedAt && <form action={cancelDistribution.bind(null, d.id)}><button className="btn btn-danger px-2 py-0.5 text-xs">Cancel</button></form>}</td>
                  </tr>
                ))}</tbody></table>
            ) : <p className="p-6 text-center text-sm text-neutral-500">Not distributed yet. <Link href={`${base}/${r.id}/distribute`} className="underline">Send it to a list</Link>.</p>}
          </section>
          {selected && (
            <section className="card overflow-x-auto">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-sm">
                <span className="font-semibold">Recipients of {selected.label}</span>
                <span className="flex gap-1 text-xs">{WHO_KEYS.map((k) => <Link key={k} href={q({ who: k })} className={`rounded px-2 py-0.5 ${who === k ? "bg-accentSoft text-accent" : "hover:bg-neutral-100"}`}>{k}</Link>)}</span>
                <span className="flex-1" />
                <form action={createListFromRecipients.bind(null, selected.id, who)}><button className="btn text-xs" disabled={!recipients.length}>Create list from these recipients</button></form>
              </div>
              <table className="data"><thead><tr><th>Name</th><th>Outlet</th><th>Email</th><th>Delivered</th><th>Opens</th><th>Clicks</th><th>Replied</th><th>Status</th><th>Error</th></tr></thead>
                <tbody>{recipients.map((x: any) => (
                  <tr key={x.id}>
                    <td>{x.contactId ? <Link href={`/contacts/${x.contactId}`} className="hover:underline">{x.name || x.email}</Link> : x.name || <span className="text-neutral-400">ad hoc</span>}</td>
                    <td className="text-xs">{x.outlet}</td><td className="text-xs">{x.email}</td>
                    <td className="text-xs">{x.deliveredAt ? x.deliveredAt.toLocaleString() : ""}</td><td>{x.openCount}</td><td>{x.clickCount}</td><td className="text-xs">{x.repliedAt ? x.repliedAt.toLocaleDateString() : ""}</td>
                    <td className="text-xs">{recipStatus(x)}</td><td className="max-w-xs truncate text-xs text-bad" title={x.error ?? ""}>{x.error}</td>
                  </tr>
                ))}</tbody></table>
              {!recipients.length && <p className="p-4 text-sm text-neutral-500">No recipients match this filter.</p>}
            </section>
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Details</h2>
            <Row k="Dateline" val={[r.datelineCity, r.datelineDate?.toLocaleDateString()].filter(Boolean).join(", ")} />
            <Row k="Slug" val={<code className="text-xs">{r.slug}</code>} />
            <Row k="Short link" val={<span className="inline-flex items-center gap-1"><a href={shortUrl(r.shortCode)} className="text-xs underline">{shortUrl(r.shortCode)}</a><CopyButton value={shortUrl(r.shortCode)} /></span>} />
            <Row k="Newsroom" val={<span className="inline-flex items-center gap-1"><a href={newsroomUrl(v.account.slug, r.slug)} className="text-xs underline">{newsroomUrl(v.account.slug, r.slug)}</a><CopyButton value={newsroomUrl(v.account.slug, r.slug)} /></span>} />
            <Row k="Tags" val={r.tags.map((t: any) => <span key={t.tagId} className="chip ml-1" style={{ background: t.tag.color + "22", color: t.tag.color }}>{t.tag.name}</span>)} />
            <Row k="Boilerplate" val={bpName(r.boilerplateId)} />
            <Row k="Footer" val={bpName(r.footerId)} />
            <Row k="Media contact" val={bpName(readMediaContactId(r.blocks))} />
            <Row k="Attachments" val={r.attachments.map((a: any) => <span key={a.assetId} className="chip ml-1">{a.asset.name}</span>)} />
            <Row k="Embargo" val={r.embargoUntil?.toLocaleString()} />
            <Row k="Created" val={`${r.createdAt.toLocaleString()} by ${userName(r.createdById)}`} />
            <Row k="Updated" val={`${r.updatedAt.toLocaleString()}${r.updatedById ? ` by ${userName(r.updatedById)}` : ""}`} />
            <Row k="Versions" val={<Link href={`${base}/${r.id}/versions`} className="underline">{r._count.versions} versions</Link>} />
          </section>
          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Coverage</h2><Link href={`/coverage/new?releaseId=${r.id}`} className="btn text-xs">Add coverage</Link></div>
            {r.coverage.length ? (
              <ul className="divide-y divide-line text-sm">{r.coverage.map((c: any) => <li key={c.id} className="py-1.5"><Link href={`/coverage/${c.id}`} className="font-medium hover:underline">{c.headline}</Link><span className="block text-xs text-neutral-500">{c.outletName} · {c.publishedAt.toLocaleDateString()}</span></li>)}</ul>
            ) : <p className="text-sm text-neutral-500">No coverage linked to this release yet.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
