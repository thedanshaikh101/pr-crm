import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { createClient, deleteClient, updateClient } from "@/server/settings";
import { ClientForm } from "@/components/settings/ClientForm";
import { ConfirmButton } from "@/components/settings/ConfirmButton";

export default async function ClientsPage({ searchParams }: { searchParams: { new?: string; edit?: string } }) {
  const v = await requireViewer();
  const [clients, boilerplates] = await Promise.all([
    db.client.findMany({ where: { accountId: v.account.id }, orderBy: { name: "asc" }, include: { _count: { select: { releases: true, coverage: true } } } }),
    db.boilerplate.findMany({ where: { accountId: v.account.id, kind: "BOILERPLATE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const bpName = (id: string | null) => boilerplates.find((b: any) => b.id === id)?.name ?? null;
  const editing = searchParams.edit ? clients.find((c: any) => c.id === searchParams.edit) ?? null : null;
  const canEdit = v.role !== "VIEWER";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Clients</h1>
        {canEdit && !searchParams.new && !editing && <Link href="/settings/clients?new=1" className="btn btn-primary">Add client</Link>}
      </div>
      <p className="text-sm text-neutral-600">Clients group releases, coverage and calendar events for reporting. Each can carry a colour, a logo for PDF reports and a default boilerplate.</p>

      {canEdit && (searchParams.new || editing) && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">{editing ? `Edit ${editing.name}` : "New client"}</h2>
          <ClientForm action={editing ? updateClient.bind(null, editing.id) : createClient} client={editing} boilerplates={boilerplates} submitLabel={editing ? "Save changes" : "Create client"} />
        </section>
      )}

      {clients.length ? (
        <div className="card overflow-x-auto">
          <table className="data">
            <thead><tr><th>Client</th><th>Colour</th><th>Default boilerplate</th><th className="text-right">Releases</th><th className="text-right">Coverage</th><th></th></tr></thead>
            <tbody>
              {clients.map((c: any) => {
                const refs = c._count.releases + c._count.coverage;
                return (
                  <tr key={c.id}>
                    <td><div className="flex items-center gap-2">{c.logoUrl ? <img src={c.logoUrl} alt="" className="h-8 w-8 rounded border border-line object-cover" /> : <span className="grid h-8 w-8 place-items-center rounded text-xs font-semibold text-white" style={{ background: c.color }}>{c.name.slice(0, 1)}</span>}<span className="font-medium">{c.name}</span></div></td>
                    <td><span className="inline-flex items-center gap-1.5 text-xs"><span className="inline-block h-4 w-4 rounded border border-line" style={{ background: c.color }} aria-hidden="true" />{c.color}</span></td>
                    <td className="text-sm">{bpName(c.defaultBoilerplateId) ?? <span className="text-neutral-400">None</span>}</td>
                    <td className="text-right"><Link href={`/releases?client=${c.id}`} className="hover:underline">{c._count.releases}</Link></td>
                    <td className="text-right"><Link href={`/coverage?client=${c.id}`} className="hover:underline">{c._count.coverage}</Link></td>
                    <td className="text-right">
                      {canEdit && (
                        <div className="flex justify-end gap-1">
                          <Link href={`/settings/clients?edit=${c.id}`} className="btn">Edit</Link>
                          <form action={deleteClient.bind(null, c.id)}>
                            <ConfirmButton title={`Delete ${c.name}`} message="This removes the client. Boilerplates and calendar events that pointed to it are kept without a client." confirmLabel="Delete" disabled={refs > 0}>Delete</ConfirmButton>
                          </form>
                        </div>
                      )}
                      {canEdit && refs > 0 && <p className="mt-1 text-xs text-neutral-500">In use by {c._count.releases} release{c._count.releases === 1 ? "" : "s"} and {c._count.coverage} coverage item{c._count.coverage === 1 ? "" : "s"}. Reassign them first.</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card p-10 text-center">
          <p className="mb-1 font-medium">No clients yet.</p>
          <p className="mb-4 text-sm text-neutral-600">Add the organisations or people you represent so releases and coverage can be filed under them.</p>
          {canEdit && <Link href="/settings/clients?new=1" className="btn btn-primary">Add client</Link>}
        </div>
      )}
    </div>
  );
}
