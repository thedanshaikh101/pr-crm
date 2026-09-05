import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { addNote, addToList, deleteContacts, mergeContacts, refreshContent, updateContact, verifyContactNow } from "@/server/contacts";
import { ContactForm } from "@/components/contacts/ContactForm";

export default async function ContactPage({ params, searchParams }: { params: { id: string }; searchParams: { edit?: string; tab?: string } }) {
  const v = await requireViewer();
  const c = await db.contact.findFirst({
    where: { id: params.id, accountId: v.account.id, deletedAt: null },
    include: {
      organization: true, subjects: { include: { subject: true } }, tags: { include: { tag: true } },
      listMembers: { include: { list: true } }, notes: { orderBy: { createdAt: "desc" } },
      recipients: { include: { distribution: { include: { release: { select: { id: true, headline: true } } } } }, orderBy: { id: "desc" }, take: 25 },
      coverage: { orderBy: { publishedAt: "desc" }, take: 10 }, conversations: { orderBy: { receivedAt: "desc" }, take: 10 },
      contentItems: { orderBy: { publishedAt: "desc" }, take: 10 },
    },
  });
  if (!c) notFound();
  const [team, lists, users] = await Promise.all([
    db.membership.findMany({ where: { accountId: v.account.id, deactivatedAt: null }, include: { user: { select: { id: true, name: true } } } }),
    db.list.findMany({ where: { accountId: v.account.id, deletedAt: null }, select: { id: true, name: true } }),
    db.user.findMany({ where: { id: { in: [c.ownerId, ...c.notes.map((n: any) => n.authorId)].filter(Boolean) } }, select: { id: true, name: true } }),
  ]);
  const userName = (id: string | null) => users.find((u: any) => u.id === id)?.name ?? "Unknown";
  const teammates = team.map((m: any) => m.user);
  const name = `${c.firstName} ${c.lastName}`.trim();
  const socials = (c.socials ?? {}) as Record<string, string>;
  const tab = searchParams.tab ?? "content";

  if (searchParams.edit) return (
    <div><h1 className="mb-3 text-xl font-semibold">Edit {name}</h1><ContactForm action={updateContact.bind(null, c.id)} c={c} teammates={teammates} submitLabel="Save changes" /><Link href={`/contacts/${c.id}`} className="btn mt-3">Cancel</Link></div>
  );

  const Card = ({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) => (
    <section className="card p-4"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{title}</h2>{right}</div>{children}</section>
  );
  const Row = ({ k, val }: { k: string; val: React.ReactNode }) => <div className="flex justify-between gap-3 py-1 text-sm"><span className="text-neutral-500">{k}</span><span className="text-right">{val || <span className="text-neutral-300">—</span>}</span></div>;
  const timeline = [
    ...c.recipients.map((r: any) => ({ at: r.deliveredAt ?? r.distribution.createdAt, text: `Emailed: ${r.distribution.release.headline}${r.firstOpenAt ? ` · opened ${r.openCount}×` : ""}${r.repliedAt ? " · replied" : ""}${r.bouncedAt ? " · bounced" : ""}`, href: `/releases/${r.distribution.release.id}` })),
    ...c.coverage.map((x: any) => ({ at: x.publishedAt, text: `Coverage: ${x.headline}`, href: `/coverage/${x.id}` })),
    ...c.conversations.map((x: any) => ({ at: x.receivedAt, text: `Enquiry: ${x.question.slice(0, 80)}`, href: `/response-desk/conversations/${x.id}` })),
    ...c.contentItems.map((x: any) => ({ at: x.publishedAt ?? new Date(0), text: `Wrote: ${x.title}`, href: x.url })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div>
      <div className="mb-3 flex items-center gap-2"><Link href="/contacts" className="btn">← Back</Link>
        <form action={async (fd: FormData) => { "use server"; const id = String(fd.get("listId")); if (id) await addToList(id, [c.id]); }} className="flex gap-1">
          <select name="listId" className="input w-48" defaultValue=""><option value="">Add to list…</option>{lists.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select><button className="btn">Add</button>
        </form>
        <details className="relative ml-auto"><summary className="btn cursor-pointer list-none">⋯</summary>
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-line bg-white py-1 shadow-lg text-sm">
            <Link className="block px-3 py-1.5 hover:bg-neutral-50" href={`/contacts/${c.id}?edit=1`}>Edit</Link>
            <form action={async (fd: FormData) => { "use server"; const id = String(fd.get("dropId")).trim(); if (id) await mergeContacts(c.id, id); }} className="px-3 py-1.5"><input name="dropId" className="input mb-1" placeholder="Duplicate contact ID" /><button className="btn w-full justify-center">Merge duplicate into this</button></form>
            <a className="block px-3 py-1.5 hover:bg-neutral-50" href={`/api/export/contacts?ids=${c.id}`}>Export contact</a>
            <Link className="block px-3 py-1.5 hover:bg-neutral-50" href={`/contacts/${c.id}?edit=1#significant`}>Report inaccuracy</Link>
            <form action={async () => { "use server"; await deleteContacts([c.id]); }}><button className="block w-full px-3 py-1.5 text-left text-bad hover:bg-red-50">Delete</button></form>
          </div>
        </details>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <header className="card flex items-start gap-4 p-5">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accentSoft text-lg font-semibold text-accent">{(c.firstName[0] ?? "") + (c.lastName[0] ?? "")}</span>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold">{name} <Link href={`/contacts/${c.id}?edit=1`} className="ml-1 text-sm text-neutral-400 hover:text-accent" aria-label="Edit name">✎</Link></h1>
              <p className="text-sm text-neutral-600">{c.jobTitle}{c.organization && <> · <Link href={`/organizations/${c.organization.id}`} className="hover:underline">{c.organization.name}</Link></>}</p>
              {c.email && <p className="mt-1 flex flex-wrap items-center gap-1 text-sm">{c.email} {c.emailStatus === "VALID" && <span className="pill bg-green-50 text-good">verified</span>}{c.emailStatus === "RISKY" && <span className="pill bg-amber-50 text-warn">risky</span>}{(c.emailStatus === "BOUNCED" || c.emailStatus === "INVALID") && <span className="pill bg-red-50 text-bad">{c.emailStatus.toLowerCase()}</span>}
                {!["BOUNCED", "COMPLAINED", "UNSUBSCRIBED"].includes(c.emailStatus) && <form action={async () => { "use server"; await verifyContactNow(c.id); }}><button className="btn px-2 py-0.5 text-xs" title="Syntax and mail-server check">{c.emailVerifiedAt ? `Re-verify (checked ${c.emailVerifiedAt.toLocaleDateString()})` : "Verify email"}</button></form>}</p>}
              {c.significantUpdate && <p className="mt-1 text-xs text-warn" id="significant">Significant update: {c.significantUpdate}</p>}
            </div>
          </header>

          <Card title="About">
            <p className="text-sm text-neutral-700">{c.bio ?? c.xBio ?? <span className="text-neutral-400">No bio yet.</span>}</p>
            {c.authorPageUrl && <a className="mt-1 block text-sm text-accent underline" href={c.authorPageUrl}>Author page</a>}
            <div className="mt-2 flex flex-wrap gap-1">{c.subjects.map((s: any) => <span key={s.subjectId} className="chip">{s.subject.path}</span>)}</div>
            <div className="mt-3 flex gap-3 text-sm">
              {c.xHandle && <a href={`https://x.com/${c.xHandle}`} className="underline">X</a>}
              {Object.entries(socials).map(([k, u]) => <a key={k} href={u} className="underline capitalize">{k}</a>)}
            </div>
          </Card>

          <Card title="Activity" right={<span className="flex gap-1">{c.rssUrl && <form action={async () => { "use server"; await refreshContent(c.id); }}><button className="btn" title={c.rssUrl}>Refresh feed</button></form>}<Link href={`/contacts/${c.id}?tab=timeline`} className="btn">View timeline</Link></span>}>
            <div className="mb-2 flex gap-1 text-xs">{[["content", "Recent Content"], ["emails", "Contacts activity"], ["desk", "Response Desk"], ["coverage", "Coverage"], ["timeline", "Timeline"]].map(([k, l]) => <Link key={k} href={`/contacts/${c.id}?tab=${k}`} className={`rounded px-2 py-1 ${tab === k ? "bg-accentSoft text-accent" : "hover:bg-neutral-100"}`}>{l}</Link>)}</div>
            <ul className="divide-y divide-line text-sm">
              {tab === "content" && (c.contentItems.length ? c.contentItems.map((x: any) => <li key={x.id} className="py-1.5"><a href={x.url} className="hover:underline">{x.title}</a> <span className="text-xs text-neutral-500">{x.publishedAt?.toLocaleDateString()}</span></li>) : <li className="py-2 text-neutral-500">{c.rssUrl ? "No articles yet from this feed. Use Refresh feed, or wait for the 6-hourly ingest." : <>No articles logged. Add an RSS feed URL to this contact (Edit) and it is checked every 6 hours, or paste one via In-Article Search.</>}</li>)}
              {tab === "emails" && (c.recipients.length ? c.recipients.map((r: any) => <li key={r.id} className="py-1.5"><Link href={`/releases/${r.distribution.release.id}`} className="hover:underline">{r.distribution.release.headline}</Link> <span className="text-xs text-neutral-500">{r.deliveredAt ? "delivered" : r.bouncedAt ? "bounced" : "sent"}{r.firstOpenAt ? ` · opened ${r.openCount}×` : ""}{r.clickCount ? ` · ${r.clickCount} clicks` : ""}{r.repliedAt ? " · replied" : ""}</span></li>) : <li className="py-2 text-neutral-500">Nothing sent to this contact yet.</li>)}
              {tab === "desk" && (c.conversations.length ? c.conversations.map((x: any) => <li key={x.id} className="py-1.5">{x.question.slice(0, 100)} <span className="text-xs text-neutral-500">{x.status}</span></li>) : <li className="py-2 text-neutral-500">No enquiries from this contact.</li>)}
              {tab === "coverage" && (c.coverage.length ? c.coverage.map((x: any) => <li key={x.id} className="py-1.5"><Link href={`/coverage/${x.id}`} className="hover:underline">{x.headline}</Link> <span className="text-xs text-neutral-500">{x.outletName}</span></li>) : <li className="py-2 text-neutral-500">No coverage linked yet.</li>)}
              {tab === "timeline" && (timeline.length ? timeline.map((t, i) => <li key={i} className="py-1.5"><span className="mr-2 text-xs text-neutral-500">{new Date(t.at).toLocaleDateString()}</span><a href={t.href} className="hover:underline">{t.text}</a></li>) : <li className="py-2 text-neutral-500">No activity yet.</li>)}
            </ul>
          </Card>

          <Card title="Notes">
            <form action={async (fd: FormData) => { "use server"; const b = String(fd.get("body") ?? "").trim(); if (b) await addNote(c.id, b); }} className="mb-3">
              <textarea name="body" className="input" rows={2} placeholder="Add a note. Everyone in the account can see it." /><button className="btn mt-1">Save note</button>
            </form>
            <ul className="space-y-2 text-sm">{c.notes.map((n: any) => <li key={n.id} className="rounded bg-neutral-50 p-2"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-xs text-neutral-500">{userName(n.authorId)} · {n.createdAt.toLocaleString()}</p></li>)}</ul>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title="At a glance">
            <Row k="Importance" val={c.importance.replace("_", " ").toLowerCase()} />
            <Row k="Category" val={c.category.toLowerCase()} />
            <Row k="Relationship owned by" val={userName(c.ownerId)} />
            <Row k="Classification" val={c.classifications.map((x: string) => <span key={x} className="chip ml-1">{x}</span>)} />
            <Row k="Language" val={c.language} />
            <Row k="Publication frequency" val={c.organization?.frequency?.toLowerCase()} />
            <Row k="Physical location" val={c.physicalLocation} />
            <Row k="Audience location" val={c.audienceLocation.map((x: string) => <span key={x} className="chip ml-1">{x}</span>)} />
            {c.tags.length > 0 && <Row k="Tags" val={c.tags.map((t: any) => <span key={t.tagId} className="chip ml-1" style={{ background: t.tag.color + "22", color: t.tag.color }}>{t.tag.name}</span>)} />}
          </Card>
          <Card title="Reach">
            <Row k="X followers" val={c.xFollowers?.toLocaleString()} />
            <Row k="Outlet domain authority" val={c.organization?.domainAuthority} />
          </Card>
          {c.organization && (
            <Card title="Associated organizations">
              <Link href={`/organizations/${c.organization.id}`} className="block rounded border border-line p-2 text-sm hover:bg-neutral-50">
                <span className="font-medium">{c.organization.name}</span>
                <span className="mt-1 flex gap-2 text-xs text-neutral-500">{c.organization.newsroomPhone && <span>☎ {c.organization.newsroomPhone}</span>}{c.organization.newsroomEmail && <span>✉ {c.organization.newsroomEmail}</span>}{c.organization.website && <span>🌐</span>}</span>
              </Link>
            </Card>
          )}
          <Card title={`Lists (${c.listMembers.length})`}>
            <ul className="text-sm">{c.listMembers.map((m: any) => <li key={m.listId}><Link href={`/lists/${m.listId}`} className="hover:underline">{m.list.name}</Link></li>)}</ul>
            {!c.listMembers.length && <p className="text-sm text-neutral-500">Not in any list.</p>}
          </Card>
          <div className="flex gap-2 text-xs"><a className="btn" href={`/api/export/contacts?ids=${c.id}`}>Export contact</a><Link className="btn" href={`/contacts/${c.id}?edit=1`}>Report inaccuracy</Link></div>
        </aside>
      </div>
    </div>
  );
}
