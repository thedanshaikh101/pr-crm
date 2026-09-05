import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildContactWhere, parseFilters } from "@/lib/contacts/filters";
import { deleteList, duplicateList, mergeLists, removeFromList } from "@/server/contacts";
import { engagementIn, hygienePct } from "@/lib/lists";

export default async function ListPage({ params }: { params: { id: string } }) {
  const v = await requireViewer();
  const l = await db.list.findFirst({ where: { id: params.id, accountId: v.account.id, deletedAt: null }, include: { distributions: { where: { isTest: false }, include: { release: true, recipients: { select: { firstOpenAt: true, repliedAt: true, deliveredAt: true } } }, orderBy: { createdAt: "desc" } } } });
  if (!l) notFound();
  const where = l.isSmart
    ? buildContactWhere(parseFilters(Object.fromEntries(new URLSearchParams((l.smartFilter as any)?.query ?? ""))), v.account.id, v.user.id)
    : { accountId: v.account.id, deletedAt: null, listMembers: { some: { listId: l.id } } };
  const contacts = await db.contact.findMany({ where, include: { organization: true, subjects: { include: { subject: true } } }, orderBy: { lastName: "asc" }, take: 1000 });
  const members = contacts.map((c: any) => ({ contact: { email: c.email, emailStatus: c.emailStatus } }));
  const h = hygienePct(members);
  const last = l.distributions[0];
  const editor = l.editedById ? await db.user.findUnique({ where: { id: l.editedById }, select: { name: true } }) : null;
  const recips = l.distributions.flatMap((d: any) => d.recipients);
  const engOut = l.distributions.reduce((n: number, d: any) => n + d.recipientCount, 0);
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Link href="/lists" className="btn">← Lists</Link>
        <h1 className="text-xl font-semibold">{l.name}{l.isSmart && <span className="pill ml-2 bg-accentSoft text-accent">⟳ Smart Group</span>}</h1>
        <details className="relative ml-auto"><summary className="btn cursor-pointer list-none">⋯</summary>
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-line bg-white py-1 text-sm shadow-lg">
            <a className="block px-3 py-1.5 hover:bg-neutral-50" href={`/api/export/contacts?list=${l.id}`}>Export all {contacts.length} items</a>
            <form action={duplicateList.bind(null, l.id)}><button className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50">Duplicate list</button></form>
            <form action={async (fd: FormData) => { "use server"; const id = String(fd.get("sourceId")).trim(); if (id) await mergeLists(l.id, id); }} className="px-3 py-1.5"><input name="sourceId" className="input mb-1" placeholder="Merge list ID into this" /><button className="btn w-full justify-center">Merge</button></form>
            <form action={deleteList.bind(null, l.id)}><button className="block w-full px-3 py-1.5 text-left text-bad hover:bg-red-50">Delete list</button></form>
          </div>
        </details>
      </div>
      <p className="mb-3 text-xs text-neutral-600">Edited {l.updatedAt.toLocaleString()}{editor ? ` by ${editor.name}` : ""} · {last ? `Distributed: ${last.release.headline}, ${last.createdAt.toLocaleDateString()}` : "Not distributed yet"}</p>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs text-neutral-600">Hygiene</p><div className="mt-1 h-2 overflow-hidden rounded bg-neutral-100"><div className={`h-full ${h >= 90 ? "bg-good" : h >= 70 ? "bg-warn" : "bg-bad"}`} style={{ width: `${h}%` }} /></div><p className="mt-1 text-sm font-semibold">{h}% valid, non-bounced email</p></div>
        <div className="card p-4"><p className="text-xs text-neutral-600">Engagement Out</p><p className="text-2xl font-semibold">{engOut.toLocaleString()}</p><p className="text-xs text-neutral-500">emails sent to this list</p></div>
        <div className="card p-4"><p className="text-xs text-neutral-600">Engagement In</p><p className="text-2xl font-semibold">{engagementIn(recips)}</p><p className="text-xs text-neutral-500">opens and replies, last 90 days</p></div>
      </div>
      <form action={async (fd: FormData) => { "use server"; await removeFromList(l.id, fd.getAll("id").map(String)); }} className="card overflow-x-auto">
        <div className="flex items-center justify-between border-b border-line px-3 py-2 text-sm"><span>{contacts.length} members</span>{!l.isSmart && <button className="btn btn-danger">Remove selected</button>}</div>
        <table className="data"><thead><tr>{!l.isSmart && <th className="w-8"></th>}<th>Name</th><th>Outlet</th><th>Job title</th><th>Email</th><th>Subjects</th></tr></thead>
          <tbody>{contacts.map((c: any) => <tr key={c.id}>{!l.isSmart && <td><input type="checkbox" name="id" value={c.id} aria-label={`Select ${c.firstName}`} /></td>}<td><Link href={`/contacts/${c.id}`} className="font-medium hover:underline">{c.firstName} {c.lastName}</Link></td><td>{c.organization?.name}</td><td>{c.jobTitle}</td><td className={["BOUNCED", "INVALID"].includes(c.emailStatus) ? "text-bad line-through" : ""}>{c.email}</td><td className="text-xs">{c.subjects.map((s: any) => s.subject.path).join(", ")}</td></tr>)}</tbody></table>
        {!contacts.length && <p className="p-4 text-sm text-neutral-500">{l.isSmart ? "The saved filter matches nobody yet." : "Empty list. Select contacts on the Media Contacts screen and choose Add to List."}</p>}
      </form>
    </div>
  );
}
