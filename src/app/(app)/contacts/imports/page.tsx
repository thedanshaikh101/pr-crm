import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { rollbackImport } from "@/server/contacts";

export default async function ImportsPage() {
  const v = await requireViewer();
  const imports = await db.import.findMany({ where: { accountId: v.account.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const users = await db.user.findMany({ where: { id: { in: imports.map((i: any) => i.userId) } }, select: { id: true, name: true } });
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h1 className="text-xl font-semibold">Imports</h1><Link href="/contacts/imports/new" className="btn btn-primary">New import</Link></div>
      <div className="card overflow-x-auto"><table className="data"><thead><tr><th>File</th><th>By</th><th>When</th><th>Status</th><th>Rows</th><th>Created</th><th>Updated</th><th>Skipped</th><th>Errors</th><th></th></tr></thead>
        <tbody>{imports.map((i: any) => (
          <tr key={i.id}>
            <td>{i.status === "MAPPING" ? <Link href={`/contacts/imports/${i.id}`} className="font-medium hover:underline">{i.fileName}</Link> : i.fileName}<span className="ml-1 text-xs text-neutral-500">{i.source}</span></td>
            <td>{users.find((u: any) => u.id === i.userId)?.name}</td><td>{i.createdAt.toLocaleString()}</td>
            <td><span className={`pill ${i.status === "DONE" ? "bg-green-50 text-good" : i.status === "ROLLED_BACK" ? "bg-neutral-100 text-neutral-600" : i.status === "FAILED" ? "bg-red-50 text-bad" : "bg-accentSoft text-accent"}`}>{i.status.toLowerCase().replace("_", " ")}</span></td>
            <td>{i.rowCount}</td><td>{i.createdCount}</td><td>{i.updatedCount}</td><td>{i.skippedCount}</td>
            <td>{i.errorCount ? <a className="text-bad underline" href={`/api/imports/${i.id}/errors`}>{i.errorCount} (CSV)</a> : 0}</td>
            <td>{i.status === "DONE" && <form action={rollbackImport.bind(null, i.id)}><button className="btn btn-danger">Roll back</button></form>}</td>
          </tr>
        ))}</tbody></table>
        {!imports.length && <p className="p-6 text-sm text-neutral-500">No imports yet.</p>}
      </div>
    </div>
  );
}
