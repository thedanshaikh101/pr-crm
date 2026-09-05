import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { sortTagRows, TAG_SORTS, tagReportRows, type TagSort } from "@/lib/planning/tagReport";

export default async function TagReportPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const v = await requireViewer();
  const s = Array.isArray(searchParams.sort) ? searchParams.sort[0] : searchParams.sort;
  const sort = (TAG_SORTS.includes(s as TagSort) ? s : "contacts") as TagSort;
  const rows = sortTagRows(await tagReportRows(v.account.id), sort);
  const groups = Array.from(new Set(rows.map((r) => r.group))).sort((a, b) => (a === "Ungrouped" ? 1 : b === "Ungrouped" ? -1 : a.localeCompare(b)));
  const Th = ({ k, label, right }: { k: TagSort; label: string; right?: boolean }) => <th className={right ? "text-right" : ""}><Link href={`/planning/tag-report?sort=${k}`} className={sort === k ? "text-accent" : ""} aria-sort={sort === k ? "descending" : "none"}>{label}{sort === k ? " ▾" : ""}</Link></th>;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div><h1 className="text-xl font-semibold">Tag Report</h1><p className="text-xs text-neutral-500">{rows.length} tags across {groups.length} group{groups.length === 1 ? "" : "s"}. Click a column to sort.</p></div>
        <div className="flex gap-2"><Link href="/settings/tags" className="btn">Manage tags</Link><a className="btn" href={`/api/planning/tag-report.csv?sort=${sort}`}>Export CSV</a></div>
      </div>
      {groups.map((g) => (
        <section key={g} className="card mb-4 overflow-x-auto">
          <h2 className="border-b border-line px-3 py-2 text-sm font-semibold">{g}</h2>
          <table className="data">
            <thead><tr><Th k="name" label="Tag" /><Th k="contacts" label="Contacts" right /><Th k="releases" label="Releases" right /><Th k="coverage" label="Coverage" right /><Th k="lastUsed" label="Last used" right /></tr></thead>
            <tbody>
              {rows.filter((r) => r.group === g).map((r) => (
                <tr key={r.id}>
                  <td><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: r.color }} />{r.name}</td>
                  <td className="text-right tabular-nums">{r.contacts ? <Link href={`/contacts?tag=${r.id}`} className="hover:underline">{r.contacts}</Link> : 0}</td>
                  <td className="text-right tabular-nums">{r.releases ? <Link href={`/releases?tag=${r.id}`} className="hover:underline">{r.releases}</Link> : 0}</td>
                  <td className="text-right tabular-nums">{r.coverage ? <Link href={`/coverage?tag=${r.id}`} className="hover:underline">{r.coverage}</Link> : 0}</td>
                  <td className="text-right text-xs text-neutral-600">{r.lastUsed ? r.lastUsed.toLocaleDateString() : "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {!rows.length && (
        <div className="card p-10 text-center">
          <p className="mb-1 font-medium">No tags yet.</p>
          <p className="mb-4 text-sm text-neutral-600">Tag contacts, releases and coverage from their tables and the counts show up here.</p>
          <Link href="/settings/tags" className="btn btn-primary">Set up tag groups</Link>
        </div>
      )}
    </div>
  );
}
