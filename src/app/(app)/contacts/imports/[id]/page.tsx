import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { commitImport } from "@/server/contacts";
import { findDuplicate, normalizeRow, TARGET_FIELDS, type TargetField } from "@/lib/contacts/import";

const LABELS: Record<TargetField, string> = {
  firstName: "First name", lastName: "Last name", fullName: "Full name (split)", email: "Email", outlet: "Outlet / organization", jobTitle: "Job title",
  landline: "Landline", mobile: "Mobile", xBio: "X bio", xHandle: "X handle", xFollowers: "X followers", subjects: "Subjects", classification: "Classification",
  audienceLocation: "Audience location", physicalLocation: "Physical location", language: "Language", domainAuthority: "Domain authority", website: "Website / author page",
  linkedin: "LinkedIn", instagram: "Instagram", tags: "Tags", notes: "Notes", skip: "— Skip this column —",
};

export default async function ImportMapPage({ params }: { params: { id: string } }) {
  const v = await requireViewer();
  const imp = await db.import.findFirst({ where: { id: params.id, accountId: v.account.id } });
  if (!imp) notFound();
  if (imp.status !== "MAPPING") return <p className="text-sm">This import has already run. See <a className="underline" href="/contacts/imports">import history</a>.</p>;
  const lists = await db.list.findMany({ where: { accountId: v.account.id, deletedAt: null, isSmart: false }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const headers = imp.headers as string[];
  const mapping = imp.mapping as Record<string, TargetField>;
  const rows = (imp.rawRows as Record<string, string>[]) ?? [];
  const preview = rows.slice(0, 5);

  // Dedupe preview against existing contacts
  const existing = await db.contact.findMany({ where: { accountId: v.account.id, deletedAt: null }, select: { id: true, email: true, firstName: true, lastName: true, organization: { select: { name: true } } } });
  const pool = existing.map((e: any) => ({ id: e.id, email: e.email, firstName: e.firstName, lastName: e.lastName, outlet: e.organization?.name ?? null }));
  const normalized = rows.map((r) => normalizeRow(r, mapping));
  const dupes = normalized.filter((n) => !n.error && findDuplicate(n, pool)).length;
  const errors = normalized.filter((n) => n.error).length;

  return (
    <form action={commitImport.bind(null, imp.id)} className="max-w-4xl space-y-4">
      <div><h1 className="text-xl font-semibold">Map columns</h1><p className="text-sm text-neutral-600">{imp.fileName} · {imp.rowCount.toLocaleString()} rows</p></div>
      <div className="card overflow-x-auto">
        <table className="data"><thead><tr><th>Column in file</th><th>Maps to</th><th>Sample values</th></tr></thead>
          <tbody>{headers.map((h) => (
            <tr key={h}><td className="font-medium">{h}</td>
              <td><select name={`map:${h}`} defaultValue={mapping[h] ?? "skip"} className="input w-56" aria-label={`Map ${h}`}>{TARGET_FIELDS.map((f) => <option key={f} value={f}>{LABELS[f]}</option>)}</select></td>
              <td className="text-xs text-neutral-600">{preview.map((r) => r[h]).filter(Boolean).slice(0, 3).join(" · ")}</td>
            </tr>))}</tbody></table>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-2xl font-semibold">{(rows.length - dupes - errors).toLocaleString()}</p><p className="text-xs text-neutral-600">new contacts</p></div>
        <div className="card p-4"><p className="text-2xl font-semibold">{dupes.toLocaleString()}</p><p className="text-xs text-neutral-600">match existing contacts (by email, then name + outlet)</p></div>
        <div className="card p-4"><p className={`text-2xl font-semibold ${errors ? "text-bad" : ""}`}>{errors.toLocaleString()}</p><p className="text-xs text-neutral-600">rows with problems (skipped, downloadable after)</p></div>
      </div>
      <div className="card space-y-3 p-4">
        <div><p className="label">When a row matches an existing contact</p>
          <label className="mr-4 text-sm"><input type="radio" name="onDuplicate" value="update" defaultChecked /> Update existing with any filled values</label>
          <label className="text-sm"><input type="radio" name="onDuplicate" value="skip" /> Skip the row</label>
        </div>
        <div><label className="label" htmlFor="listId">Add every imported row to a list</label>
          <select id="listId" name="listId" className="input max-w-sm" defaultValue="none"><option value="none">Don’t add to a list</option><option value="new">Create a new list…</option>{lists.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <input name="newListName" className="input mt-1 max-w-sm" placeholder="New list name (if creating)" />
        </div>
      </div>
      <button className="btn btn-primary">Run import</button>
    </form>
  );
}
