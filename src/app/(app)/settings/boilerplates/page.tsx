import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { cleanHtml } from "@/lib/html";
import { deleteBoilerplate, saveBoilerplate } from "@/server/settings";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ConfirmButton } from "@/components/settings/ConfirmButton";

const KINDS = [["BOILERPLATE", "Boilerplates", "The About paragraph appended to a release."], ["FOOTER", "Email footers", "Closing block for distribution emails: address, unsubscribe wording, socials."], ["MEDIA_CONTACT", "Media contacts", "Who to call, shown on the newsroom and under each release."]] as const;
type Kind = (typeof KINDS)[number][0];

export default async function BoilerplatesPage({ searchParams }: { searchParams: { new?: string; kind?: string; edit?: string; preview?: string } }) {
  const v = await requireViewer();
  const [rows, clients] = await Promise.all([
    db.boilerplate.findMany({ where: { accountId: v.account.id }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.client.findMany({ where: { accountId: v.account.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const ids = rows.map((r: any) => r.id as string);
  const [bpRefs, ftRefs] = await Promise.all([
    db.release.groupBy({ by: ["boilerplateId"], where: { accountId: v.account.id, boilerplateId: { in: ids } }, _count: true }),
    db.release.groupBy({ by: ["footerId"], where: { accountId: v.account.id, footerId: { in: ids } }, _count: true }),
  ]);
  const refCount = (id: string) => (bpRefs.find((r: any) => r.boilerplateId === id)?._count ?? 0) + (ftRefs.find((r: any) => r.footerId === id)?._count ?? 0);
  const clientName = (id: string | null) => clients.find((c: any) => c.id === id)?.name ?? null;
  const canEdit = v.role !== "VIEWER";
  const editing = searchParams.edit ? rows.find((r: any) => r.id === searchParams.edit) ?? null : null;
  const preview = searchParams.preview ? rows.find((r: any) => r.id === searchParams.preview) ?? null : null;
  const showForm = canEdit && (editing || searchParams.new);
  const formKind: Kind = (editing?.kind as Kind) ?? ((KINDS.some((k) => k[0] === searchParams.kind) ? searchParams.kind : "BOILERPLATE") as Kind);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Email Footers and Boilerplates</h1>
        {canEdit && !showForm && <Link href="/settings/boilerplates?new=1" className="btn btn-primary">New block</Link>}
      </div>
      <p className="text-sm text-neutral-600">Reusable blocks picked in the release editor. Mark one per kind as the default (per client, or account-wide) and new releases start with it.</p>

      {showForm && (
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{editing ? `Edit ${editing.name}` : "New block"}</h2><Link href="/settings/boilerplates" className="btn">Cancel</Link></div>
          <form action={saveBoilerplate.bind(null, editing?.id ?? null)} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1"><label className="label" htmlFor="b-name">Name</label><input id="b-name" name="name" className="input" required defaultValue={editing?.name ?? ""} /></div>
              <div><label className="label" htmlFor="b-kind">Kind</label><select id="b-kind" name="kind" className="input" defaultValue={formKind}>{KINDS.map((k) => <option key={k[0]} value={k[0]}>{k[1]}</option>)}</select></div>
              <div><label className="label" htmlFor="b-client">Client</label><select id="b-client" name="clientId" className="input" defaultValue={editing?.clientId ?? ""}><option value="">Any client</option>{clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            </div>
            <div><span className="label">Body</span><RichTextEditor name="body" defaultValue={editing?.body ?? ""} minHeight={180} placeholder="About Acme: Acme is a…" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefault" defaultChecked={editing?.isDefault ?? false} /> Set as the default for this kind (and client, if one is chosen)</label>
            <button className="btn btn-primary">{editing ? "Save changes" : "Create block"}</button>
          </form>
        </section>
      )}

      {preview && (
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Preview: {preview.name}</h2><div className="flex gap-1">{canEdit && <Link href={`/settings/boilerplates?edit=${preview.id}`} className="btn">Edit</Link>}<Link href="/settings/boilerplates" className="btn">Close</Link></div></div>
          <div className="prose prose-sm max-w-none rounded border border-line bg-neutral-50 p-4" dangerouslySetInnerHTML={{ __html: cleanHtml(preview.body) }} />
        </section>
      )}

      {KINDS.map(([kind, label, blurb]) => {
        const list = rows.filter((r: any) => r.kind === kind);
        return (
          <section key={kind} className="card overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
              <div><h2 className="text-sm font-semibold">{label} <span className="font-normal text-neutral-500">({list.length})</span></h2><p className="text-xs text-neutral-500">{blurb}</p></div>
              {canEdit && <Link href={`/settings/boilerplates?new=1&kind=${kind}`} className="btn">Add</Link>}
            </div>
            {list.length ? (
              <table className="data">
                <thead><tr><th>Name</th><th>Client</th><th>Default</th><th>Used by</th><th></th></tr></thead>
                <tbody>
                  {list.map((b: any) => {
                    const refs = refCount(b.id);
                    return (
                      <tr key={b.id}>
                        <td><Link href={`/settings/boilerplates?preview=${b.id}`} className="font-medium hover:underline">{b.name}</Link></td>
                        <td className="text-sm">{clientName(b.clientId) ?? <span className="text-neutral-400">Any</span>}</td>
                        <td>{b.isDefault && <span className="pill bg-accentSoft text-accent">Default</span>}</td>
                        <td className="text-sm text-neutral-600">{refs ? `${refs} release${refs === 1 ? "" : "s"}` : <span className="text-neutral-400">Not used</span>}</td>
                        <td className="text-right">
                          {canEdit && (
                            <div className="flex justify-end gap-1">
                              <Link href={`/settings/boilerplates?edit=${b.id}`} className="btn">Edit</Link>
                              <form action={deleteBoilerplate.bind(null, b.id)}>
                                <ConfirmButton title={`Delete ${b.name}`} message={refs ? `${refs} release${refs === 1 ? " uses" : "s use"} this block. They keep their text but lose the link, so future edits here will not reach them.` : "This block is not used by any release."} confirmLabel="Delete">Delete</ConfirmButton>
                              </form>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <p className="p-4 text-sm text-neutral-500">None yet.{canEdit && <> <Link href={`/settings/boilerplates?new=1&kind=${kind}`} className="underline">Add one</Link>.</>}</p>}
          </section>
        );
      })}
    </div>
  );
}
