import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { mergeOrganizations, updateOrganization } from "@/server/contacts";
import { CLASSIFICATIONS, FREQUENCIES } from "@/lib/contacts/filters";

export default async function OrgPage({ params }: { params: { id: string } }) {
  const v = await requireViewer();
  const o = await db.organization.findFirst({ where: { id: params.id, accountId: v.account.id, deletedAt: null }, include: { contacts: { where: { deletedAt: null }, orderBy: { lastName: "asc" } }, subjects: { include: { subject: true } } } });
  if (!o) notFound();
  const socials = (o.socials ?? {}) as Record<string, string>;
  return (
    <div>
      <Link href="/organizations" className="btn mb-3">← Organizations</Link>
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <header className="card flex items-center gap-4 p-5">
            {o.logoUrl ? <img src={o.logoUrl} alt="" className="h-12 w-12 rounded object-contain" /> : <span className="grid h-12 w-12 place-items-center rounded bg-accentSoft font-semibold text-accent">{o.name[0]}</span>}
            <div><h1 className="text-xl font-semibold">{o.name}</h1>{o.website && <a href={o.website} className="text-sm text-accent underline">{o.website}</a>}</div>
            <div className="ml-auto flex gap-2 text-sm text-neutral-600">{o.newsroomEmail && <span>✉ {o.newsroomEmail}</span>}{o.newsroomPhone && <span>☎ {o.newsroomPhone}</span>}</div>
          </header>
          <section className="card">
            <h2 className="border-b border-line px-4 py-2 text-sm font-semibold">People ({o.contacts.length})</h2>
            <table className="data"><thead><tr><th>Name</th><th>Job title</th><th>Email</th><th>Subjects</th></tr></thead>
              <tbody>{o.contacts.map((c: any) => <tr key={c.id}><td><Link href={`/contacts/${c.id}`} className="font-medium hover:underline">{c.firstName} {c.lastName}</Link></td><td>{c.jobTitle}</td><td>{c.email}</td><td className="text-xs text-neutral-600">{c.classifications.join(", ")}</td></tr>)}</tbody></table>
            {!o.contacts.length && <p className="p-4 text-sm text-neutral-500">No people at this outlet yet.</p>}
          </section>
        </div>
        <aside className="space-y-4">
          <form action={updateOrganization.bind(null, o.id)} className="card space-y-2 p-4">
            <h2 className="text-sm font-semibold">Outlet details</h2>
            <div><label className="label">Website</label><input name="website" className="input" defaultValue={o.website ?? ""} /></div>
            <div><label className="label">Domain authority (0–100)</label><input name="domainAuthority" type="number" min={0} max={100} className="input" defaultValue={o.domainAuthority ?? ""} /></div>
            <div><label className="label">Publication frequency</label><select name="frequency" className="input" defaultValue={o.frequency ?? ""}><option value="">—</option>{FREQUENCIES.map((f) => <option key={f} value={f}>{f[0] + f.slice(1).toLowerCase()}</option>)}</select></div>
            <div><label className="label">Classifications (separate with ;)</label><input name="classifications" list="cls" className="input" defaultValue={o.classifications.join("; ")} /><datalist id="cls">{CLASSIFICATIONS.map((x) => <option key={x} value={x} />)}</datalist></div>
            <div><label className="label">Audience location (separate with ;)</label><input name="audienceLocation" className="input" defaultValue={o.audienceLocation.join("; ")} /></div>
            <div><label className="label">Language</label><input name="language" className="input" defaultValue={o.language ?? ""} /></div>
            <div><label className="label">Newsroom email</label><input name="newsroomEmail" className="input" defaultValue={o.newsroomEmail ?? ""} /></div>
            <div><label className="label">Newsroom phone</label><input name="newsroomPhone" className="input" defaultValue={o.newsroomPhone ?? ""} /></div>
            <button className="btn btn-primary">Save</button>
          </form>
          {Object.keys(socials).length > 0 && <div className="card p-4 text-sm"><h2 className="mb-1 font-semibold">Social</h2>{Object.entries(socials).map(([k, u]) => <a key={k} href={u} className="mr-2 underline capitalize">{k}</a>)}</div>}
          <form action={async (fd: FormData) => { "use server"; const id = String(fd.get("dropId")).trim(); if (id) await mergeOrganizations(o.id, id); }} className="card p-4">
            <h2 className="mb-1 text-sm font-semibold">Merge a duplicate into this outlet</h2>
            <p className="mb-2 text-xs text-neutral-600">People and coverage on the duplicate move here; the duplicate is retired.</p>
            <input name="dropId" className="input mb-2" placeholder="Duplicate organization ID" /><button className="btn">Merge</button>
          </form>
        </aside>
      </div>
    </div>
  );
}
