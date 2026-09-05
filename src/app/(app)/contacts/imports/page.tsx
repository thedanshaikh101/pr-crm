import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { rollbackImport } from "@/server/contacts";
import { rollbackSummary } from "@/lib/contacts/rollback";

const TONE: Record<string, string> = { DONE: "bg-green-50 text-good", ROLLED_BACK: "bg-neutral-100 text-neutral-600", FAILED: "bg-red-50 text-bad", RUNNING: "bg-amber-50 text-warn" };

export default async function ImportsPage() {
  const v = await requireViewer();
  const imports = await db.import.findMany({ where: { accountId: v.account.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const users = await db.user.findMany({ where: { id: { in: imports.map((i: any) => i.userId) } }, select: { id: true, name: true } });
  const running = imports.some((i: any) => i.status === "RUNNING");
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h1 className="text-xl font-semibold">Imports</h1><div className="flex gap-2">{running && <Link href="/contacts/imports" className="btn">Refresh</Link>}<Link href="/contacts/imports/new" className="btn btn-primary">New import</Link></div></div>
      {running && <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm" role="status">An import is running in the background. Large files are processed by the worker; refresh to see the counts update. Rows already imported are visible in Media Contacts as they land.</p>}
      <div className="card overflow-x-auto"><table className="data"><thead><tr><th>File</th><th>By</th><th>When</th><th>Status</th><th>Rows</th><th>Created</th><th>Updated</th><th>Skipped</th><th>Errors</th><th></th></tr></thead>
        <tbody>{imports.map((i: any) => {
          const staged = !!i.options?.staged;
          const rb = rollbackSummary(i);
          return (
          <tr key={i.id}>
            <td>{i.status === "MAPPING" ? <Link href={`/contacts/imports/${i.id}`} className="font-medium hover:underline">{i.fileName}</Link> : i.fileName}<span className="ml-1 text-xs text-neutral-500">{i.source}{staged ? " · background" : ""}</span></td>
            <td>{users.find((u: any) => u.id === i.userId)?.name}</td><td>{i.createdAt.toLocaleString()}</td>
            <td><span className={`pill ${TONE[i.status] ?? "bg-accentSoft text-accent"}`}>{i.status.toLowerCase().replace("_", " ")}</span>{i.status === "RUNNING" && <span className="ml-1 text-xs text-neutral-500">{staged ? "in the worker" : "in progress"}</span>}{i.status === "ROLLED_BACK" && i.rolledBackAt && <span className="ml-1 text-xs text-neutral-500">{i.rolledBackAt.toLocaleDateString()}</span>}</td>
            <td>{i.rowCount.toLocaleString()}</td><td>{i.createdCount.toLocaleString()}</td><td>{i.updatedCount.toLocaleString()}</td><td>{i.skippedCount.toLocaleString()}</td>
            <td>{i.errorCount ? <a className="text-bad underline" href={`/api/imports/${i.id}/errors`}>{i.errorCount} (CSV)</a> : 0}</td>
            <td>{i.status === "DONE" && <form action={rollbackImport.bind(null, i.id)}><button className="btn btn-danger whitespace-nowrap" title={`Soft-deletes the ${rb.removes} contacts this import created, restores the ${rb.reverts} it changed, and removes list memberships it added.`}>{rb.label}</button></form>}</td>
          </tr>);
        })}</tbody></table>
        {!imports.length && <p className="p-6 text-sm text-neutral-500">No imports yet.</p>}
      </div>
    </div>
  );
}
