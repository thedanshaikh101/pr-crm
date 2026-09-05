"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToList, bulkTag, deleteContacts } from "@/server/contacts";

type Row = {
  id: string; name: string; outlet: string | null; orgId: string | null; jobTitle: string | null; xBio: string | null; xFollowers: number | null;
  classifications: string[]; email: string | null; emailStatus: string; landline: string | null; mobile: string | null; audienceLocation: string[];
  domainAuthority: number | null; significantUpdate: string | null; isEx: boolean; subjects: string[]; lists: { id: string; name: string }[];
};
type Col = { key: string; label: string; visible: boolean };

function Popover({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button type="button" className="text-left underline decoration-dotted" onClick={() => setOpen(!open)}>{label}</button>
      {open && <span className="absolute left-0 top-full z-20 mt-1 block w-64 rounded-md border border-line bg-white p-2 text-xs shadow-lg" onMouseLeave={() => setOpen(false)}>{children}</span>}
    </span>
  );
}

export function ContactTable({ rows, columns, view, lists }: { rows: Row[]; columns: Col[]; view: "table" | "cards"; lists: { id: string; name: string }[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const router = useRouter();
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const ids = Array.from(sel);
  const cols = columns.filter((c) => c.visible);

  const cell = (r: Row, key: string) => {
    switch (key) {
      case "name": return <Link href={`/contacts/${r.id}`} className="font-medium hover:underline">{r.name}{r.isEx && <span className="pill ml-1 bg-neutral-100 text-neutral-600">ex</span>}</Link>;
      case "outlet": return r.orgId ? <Link href={`/organizations/${r.orgId}`} className="hover:underline">{r.outlet}</Link> : <span className="text-neutral-400">—</span>;
      case "jobTitle": return r.jobTitle ?? "";
      case "xBio": return <span className="line-clamp-2 max-w-xs text-neutral-600">{r.xBio}</span>;
      case "subjects": return r.subjects.length ? <Popover label={`${r.subjects.length} subject${r.subjects.length > 1 ? "s" : ""}`}>{r.subjects.map((s) => <span key={s} className="chip mb-1 mr-1">{s}</span>)}</Popover> : "";
      case "xFollowers": return r.xFollowers?.toLocaleString() ?? "";
      case "classification": return r.classifications.join(", ");
      case "inList": return r.lists.length ? <Popover label={`☰ ${r.lists.length}`}>{r.lists.map((l) => <Link key={l.id} href={`/lists/${l.id}`} className="block py-0.5 hover:underline">{l.name}</Link>)}</Popover> : "";
      case "audienceLocation": return r.audienceLocation.join(", ");
      case "domainAuthority": return r.domainAuthority ?? "";
      case "email": return r.email ? <span className={r.emailStatus === "BOUNCED" || r.emailStatus === "INVALID" ? "text-bad line-through" : ""}>{r.email}</span> : "";
      case "landline": return r.landline ?? "";
      case "mobile": return r.mobile ?? "";
      case "significantUpdate": return r.significantUpdate ? <span className="text-warn">{r.significantUpdate}</span> : "";
      default: return "";
    }
  };

  const Bulk = () => sel.size > 0 && (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-accentSoft px-3 py-2 text-sm">
      <span className="font-medium">{sel.size} selected</span>
      <select className="input w-48" defaultValue="" onChange={(e) => { const id = e.target.value; if (id) start(async () => { await addToList(id, ids); setSel(new Set()); router.refresh(); }); }} aria-label="Add to list">
        <option value="">Add to list…</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <button className="btn" onClick={() => { const t = prompt("Tag name"); if (t) start(async () => { await bulkTag(ids, t); setSel(new Set()); router.refresh(); }); }}>Tag</button>
      <a className="btn" href={`/api/export/contacts?ids=${ids.join(",")}`}>Export CSV</a>
      <Link className="btn" href={`/lists/new?smart=1&ids=${ids.join(",")}`}>Add to Smart Group</Link>
      <button className="btn btn-danger" disabled={pending} onClick={() => { if (confirm(`Move ${sel.size} contact(s) to Deleted Items?`)) start(async () => { await deleteContacts(ids); setSel(new Set()); router.refresh(); }); }}>Delete</button>
    </div>
  );

  if (view === "cards") return (
    <div>
      <Bulk />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((r) => (
          <div key={r.id} className="card p-3">
            <div className="flex items-start gap-2">
              <input type="checkbox" checked={sel.has(r.id)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(r.id) : n.delete(r.id); setSel(n); }} aria-label={`Select ${r.name}`} />
              <div className="min-w-0">
                <Link href={`/contacts/${r.id}`} className="block truncate font-medium hover:underline">{r.name}</Link>
                <p className="truncate text-xs text-neutral-600">{[r.jobTitle, r.outlet].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
            {r.xBio && <p className="mt-2 line-clamp-3 text-xs text-neutral-600">{r.xBio}</p>}
            <div className="mt-2 flex flex-wrap gap-1">{r.subjects.slice(0, 3).map((s) => <span key={s} className="chip">{s.split(" > ").pop()}</span>)}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <Bulk />
      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th className="w-8"><input type="checkbox" checked={all} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} aria-label="Select all on page" /></th>
              {cols.map((c) => <th key={c.key} style={{ resize: "horizontal", overflow: "hidden", minWidth: 80 }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><input type="checkbox" checked={sel.has(r.id)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(r.id) : n.delete(r.id); setSel(n); }} aria-label={`Select ${r.name}`} /></td>
                {cols.map((c) => <td key={c.key}>{cell(r, c.key)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
