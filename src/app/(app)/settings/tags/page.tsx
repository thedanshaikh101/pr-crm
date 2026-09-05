import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { createTag, createTagGroup, deleteTag, deleteTagGroup, mergeTags, renameTagGroup, updateTag } from "@/server/settings";
import { describeCounts } from "@/lib/settings/tags";
import { ConfirmButton } from "@/components/settings/ConfirmButton";

type TagRow = { id: string; name: string; color: string; groupId: string | null; _count: { contacts: number; releases: number; coverage: number } };

export default async function TagsPage({ searchParams }: { searchParams: { edit?: string } }) {
  const v = await requireViewer();
  const [groups, tags] = await Promise.all([
    db.tagGroup.findMany({ where: { accountId: v.account.id }, orderBy: { name: "asc" } }),
    db.tag.findMany({ where: { accountId: v.account.id }, orderBy: { name: "asc" }, include: { _count: { select: { contacts: true, releases: true, coverage: true } } } }),
  ]);
  const canEdit = v.role !== "VIEWER";
  const editing = searchParams.edit ? (tags as TagRow[]).find((t) => t.id === searchParams.edit) ?? null : null;
  const sections: { id: string | null; name: string; tags: TagRow[] }[] = [
    ...groups.map((g: any) => ({ id: g.id as string, name: g.name as string, tags: (tags as TagRow[]).filter((t) => t.groupId === g.id) })),
    { id: null, name: "Ungrouped", tags: (tags as TagRow[]).filter((t) => !t.groupId) },
  ];

  const Table = ({ rows }: { rows: TagRow[] }) => rows.length ? (
    <table className="data">
      <thead><tr><th>Tag</th><th className="text-right">Contacts</th><th className="text-right">Releases</th><th className="text-right">Coverage</th><th></th></tr></thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id}>
            <td><span className="chip" style={{ background: t.color + "22", color: t.color }}>{t.name}</span></td>
            <td className="text-right"><Link href={`/contacts?tag=${t.id}`} className="hover:underline">{t._count.contacts}</Link></td>
            <td className="text-right">{t._count.releases}</td>
            <td className="text-right">{t._count.coverage}</td>
            <td className="text-right">{canEdit && <Link href={`/settings/tags?edit=${t.id}#edit`} className="btn">Edit</Link>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : <p className="p-3 text-sm text-neutral-500">No tags in this group.</p>;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Tag Groups</h1>
      <p className="text-sm text-neutral-600">Tags label contacts, releases and coverage. Groups (Client, Campaign, Topic) keep the pickers tidy and feed the Tag Report.</p>

      {canEdit && editing && (
        <section id="edit" className="card space-y-4 p-4">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Edit tag: {editing.name}</h2><Link href="/settings/tags" className="btn">Close</Link></div>
          <form action={updateTag.bind(null, editing.id)} className="flex flex-wrap items-end gap-2">
            <div className="flex-1"><label className="label" htmlFor="t-name">Name</label><input id="t-name" name="name" className="input" defaultValue={editing.name} required /></div>
            <div><label className="label" htmlFor="t-color">Colour</label><input id="t-color" name="color" type="color" className="input h-9 w-16 p-1" defaultValue={editing.color} /></div>
            <div><label className="label" htmlFor="t-group">Group</label><select id="t-group" name="groupId" className="input" defaultValue={editing.groupId ?? ""}><option value="">Ungrouped</option>{groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
            <button className="btn btn-primary">Save</button>
          </form>
          <div className="grid gap-3 sm:grid-cols-2">
            <form action={mergeTags.bind(null, editing.id)} className="rounded border border-line p-3">
              <label className="label" htmlFor="t-into">Merge into another tag</label>
              <p className="mb-2 text-xs text-neutral-600">Everything tagged {editing.name} ({describeCounts(editing._count)}) moves to the tag you pick, then {editing.name} is deleted.</p>
              <div className="flex gap-2">
                <select id="t-into" name="intoId" className="input" required defaultValue=""><option value="" disabled>Choose a tag</option>{(tags as TagRow[]).filter((t) => t.id !== editing.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                <ConfirmButton title={`Merge ${editing.name}`} message={`Move ${describeCounts(editing._count)} to the selected tag and delete ${editing.name}. This cannot be undone.`} confirmLabel="Merge" className="btn">Merge</ConfirmButton>
              </div>
            </form>
            <form action={deleteTag.bind(null, editing.id)} className="rounded border border-line p-3">
              <p className="label">Delete this tag</p>
              <p className="mb-2 text-xs text-neutral-600">Removes the tag from {describeCounts(editing._count)}. The records themselves are kept.</p>
              <ConfirmButton title={`Delete ${editing.name}`} message={`The tag is removed from ${describeCounts(editing._count)}. This cannot be undone.`} confirmLabel="Delete tag">Delete tag</ConfirmButton>
            </form>
          </div>
        </section>
      )}

      {canEdit && (
        <div className="grid gap-3 lg:grid-cols-2">
          <form action={createTag} className="card flex flex-wrap items-end gap-2 p-4">
            <div className="flex-1"><label className="label" htmlFor="n-name">New tag</label><input id="n-name" name="name" className="input" placeholder="Spring campaign" required /></div>
            <div><label className="label" htmlFor="n-color">Colour</label><input id="n-color" name="color" type="color" className="input h-9 w-16 p-1" defaultValue="#1F5FBF" /></div>
            <div><label className="label" htmlFor="n-group">Group</label><select id="n-group" name="groupId" className="input" defaultValue=""><option value="">Ungrouped</option>{groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
            <button className="btn btn-primary">Add tag</button>
          </form>
          <form action={createTagGroup} className="card flex items-end gap-2 p-4">
            <div className="flex-1"><label className="label" htmlFor="g-name">New group</label><input id="g-name" name="name" className="input" placeholder="Region" required /></div>
            <button className="btn">Add group</button>
          </form>
        </div>
      )}

      {sections.map((s) => (
        <section key={s.id ?? "ungrouped"} className="card overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
            <h2 className="text-sm font-semibold">{s.name} <span className="font-normal text-neutral-500">({s.tags.length})</span></h2>
            {canEdit && s.id && (
              <div className="flex items-center gap-2">
                <form action={renameTagGroup.bind(null, s.id)} className="flex gap-1"><input name="name" className="input w-40" defaultValue={s.name} aria-label={`Rename ${s.name}`} /><button className="btn">Rename</button></form>
                <form action={deleteTagGroup.bind(null, s.id)}><ConfirmButton title={`Delete group ${s.name}`} message={`Its ${s.tags.length} tag${s.tags.length === 1 ? "" : "s"} move to Ungrouped. Nothing tagged is changed.`} confirmLabel="Delete group">Delete</ConfirmButton></form>
              </div>
            )}
          </div>
          <Table rows={s.tags} />
        </section>
      ))}
      {!tags.length && <div className="card p-10 text-center"><p className="mb-1 font-medium">No tags yet.</p><p className="text-sm text-neutral-600">Add a tag above, or tag contacts in bulk from the Media Contacts screen.</p></div>}
    </div>
  );
}
