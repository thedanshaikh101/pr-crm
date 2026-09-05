import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { CLASSIFICATIONS } from "@/lib/contacts/filters";
import { addClassification, deleteClassification, renameClassification } from "@/server/settings";
import { ConfirmButton } from "@/components/settings/ConfirmButton";

export default async function ClassificationsPage() {
  const v = await requireViewer();
  if ((await db.classification.count({ where: { accountId: null } })) === 0) {
    await db.classification.createMany({ data: CLASSIFICATIONS.map((name) => ({ accountId: null, name })) });
  }
  const [system, mine, inUse] = await Promise.all([
    db.classification.findMany({ where: { accountId: null }, orderBy: { name: "asc" } }),
    db.classification.findMany({ where: { accountId: v.account.id }, orderBy: { name: "asc" } }),
    db.$queryRaw`SELECT unnest(classifications) AS name, count(*)::int AS n FROM "Contact" WHERE "accountId" = ${v.account.id} AND "deletedAt" IS NULL GROUP BY 1` as Promise<{ name: string; n: number }[]>,
  ]);
  const counts = new Map<string, number>(inUse.map((r) => [r.name, r.n]));
  const canEdit = v.role !== "VIEWER";
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Contact Classifications</h1>
      <p className="text-sm text-neutral-600">Classifications describe an outlet or a person (Television, Podcast, Freelancer). They are stored as free text on each contact and organization; the lists below only feed the pickers and filters. Renaming or deleting here leaves existing contacts as they are.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="border-b border-line px-4 py-2 text-sm font-semibold">System defaults <span className="font-normal text-neutral-500">(read only)</span></h2>
          <ul className="divide-y divide-line">{system.map((c: any) => <li key={c.id} className="flex justify-between px-4 py-2 text-sm"><span>{c.name}</span><span className="text-xs text-neutral-500">{counts.get(c.name) ?? 0} contacts</span></li>)}</ul>
        </section>
        <section className="card">
          <h2 className="border-b border-line px-4 py-2 text-sm font-semibold">Added by {v.account.name} <span className="font-normal text-neutral-500">({mine.length})</span></h2>
          <ul className="divide-y divide-line">
            {mine.map((c: any) => (
              <li key={c.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                {canEdit ? (
                  <>
                    <form action={renameClassification.bind(null, c.id)} className="flex flex-1 gap-1"><input name="name" className="input" defaultValue={c.name} aria-label={`Rename ${c.name}`} required /><button className="btn">Rename</button></form>
                    <span className="text-xs text-neutral-500">{counts.get(c.name) ?? 0}</span>
                    <form action={deleteClassification.bind(null, c.id)}><ConfirmButton title={`Delete ${c.name}`} message="Contacts keep the text; it just leaves the picker." confirmLabel="Delete">Delete</ConfirmButton></form>
                  </>
                ) : <span>{c.name}</span>}
              </li>
            ))}
            {!mine.length && <li className="px-4 py-3 text-sm text-neutral-500">No account-specific classifications yet.</li>}
          </ul>
          {canEdit && <form action={addClassification} className="flex gap-2 border-t border-line p-3"><input name="name" className="input" placeholder="Newsletter, Trade association" required aria-label="New classification" /><button className="btn btn-primary">Add</button></form>}
        </section>
      </div>
    </div>
  );
}
