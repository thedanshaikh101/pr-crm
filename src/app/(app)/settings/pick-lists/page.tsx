import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { PICKLIST_DEFAULTS, PICKLIST_KINDS, PICKLIST_LABELS, type PickListKind } from "@/lib/settings/defaults";
import { addPickListItem, deletePickListItem, renamePickListItem } from "@/server/settings";
import { ConfirmButton } from "@/components/settings/ConfirmButton";

async function ensureDefaults(accountId: string, kind: PickListKind) {
  const n = await db.pickListItem.count({ where: { accountId, kind } });
  if (n === 0) await db.pickListItem.createMany({ data: PICKLIST_DEFAULTS[kind].map((name) => ({ accountId, kind, name })), skipDuplicates: true });
}

export default async function PickListsPage() {
  const v = await requireViewer();
  for (const k of PICKLIST_KINDS) await ensureDefaults(v.account.id, k);
  const items = await db.pickListItem.findMany({ where: { accountId: v.account.id }, orderBy: { name: "asc" } });
  const canEdit = v.role !== "VIEWER";
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Case Types and Topic Types</h1>
      <p className="text-sm text-neutral-600">Case types classify Response Desk conversations; topic types classify topics. Both are free text on the record, so renaming here does not rewrite older rows.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {PICKLIST_KINDS.map((kind) => {
          const rows = items.filter((i: any) => i.kind === kind);
          return (
            <section key={kind} className="card">
              <h2 className="border-b border-line px-4 py-2 text-sm font-semibold">{PICKLIST_LABELS[kind]} <span className="font-normal text-neutral-500">({rows.length})</span></h2>
              <ul className="divide-y divide-line">
                {rows.map((i: any) => (
                  <li key={i.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                    {canEdit ? (
                      <>
                        <form action={renamePickListItem.bind(null, i.id)} className="flex flex-1 gap-1"><input name="name" className="input" defaultValue={i.name} aria-label={`Rename ${i.name}`} required /><button className="btn">Rename</button></form>
                        <form action={deletePickListItem.bind(null, i.id)}><ConfirmButton title={`Delete ${i.name}`} message="Existing records keep the text; it just leaves the picker." confirmLabel="Delete">Delete</ConfirmButton></form>
                      </>
                    ) : <span>{i.name}</span>}
                  </li>
                ))}
                {!rows.length && <li className="px-4 py-3 text-sm text-neutral-500">Nothing here yet.</li>}
              </ul>
              {canEdit && <form action={addPickListItem.bind(null, kind)} className="flex gap-2 border-t border-line p-3"><input name="name" className="input" placeholder={`New ${PICKLIST_LABELS[kind].toLowerCase().replace(/s$/, "")}`} required aria-label={`New ${PICKLIST_LABELS[kind]}`} /><button className="btn btn-primary">Add</button></form>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
