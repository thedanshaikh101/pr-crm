import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { daysLeft, DELETED_LABELS, DELETED_TYPES, recycleCutoff, type DeletedType } from "@/lib/settings/retention";
import { purgeDeleted, restoreDeleted } from "@/server/settings";
import { ConfirmButton } from "@/components/settings/ConfirmButton";

type Row = { id: string; label: string; sub: string | null; deletedAt: Date };

async function loadRows(accountId: string, type: DeletedType): Promise<Row[]> {
  const where = { accountId, deletedAt: { not: null, gte: recycleCutoff() } };
  const order = { deletedAt: "desc" as const };
  switch (type) {
    case "contacts": return (await db.contact.findMany({ where, orderBy: order, take: 500, include: { organization: { select: { name: true } } } })).map((c: any) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`.trim(), sub: [c.email, c.organization?.name, c.mergedIntoId ? "merged" : null].filter(Boolean).join(" · ") || null, deletedAt: c.deletedAt }));
    case "organizations": return (await db.organization.findMany({ where, orderBy: order, take: 500 })).map((o: any) => ({ id: o.id, label: o.name, sub: o.domain, deletedAt: o.deletedAt }));
    case "lists": return (await db.list.findMany({ where, orderBy: order, take: 500, include: { _count: { select: { members: true } } } })).map((l: any) => ({ id: l.id, label: l.name, sub: l.isSmart ? "Smart group" : `${l._count.members} members`, deletedAt: l.deletedAt }));
    case "releases": return (await db.release.findMany({ where, orderBy: order, take: 500 })).map((r: any) => ({ id: r.id, label: r.headline, sub: `${r.kind === "NEWSLETTER" ? "Newsletter" : "Release"} · ${r.status.toLowerCase()}`, deletedAt: r.deletedAt }));
    case "coverage": return (await db.coverage.findMany({ where, orderBy: order, take: 500 })).map((c: any) => ({ id: c.id, label: c.headline, sub: `${c.outletName} · ${c.publishedAt.toLocaleDateString()}`, deletedAt: c.deletedAt }));
    case "assets": return (await db.asset.findMany({ where, orderBy: order, take: 500 })).map((a: any) => ({ id: a.id, label: a.name, sub: [a.kind, a.mime].filter(Boolean).join(" · "), deletedAt: a.deletedAt }));
  }
}

export default async function DeletedPage({ searchParams }: { searchParams: { type?: string } }) {
  const v = await requireViewer();
  const type: DeletedType = (DELETED_TYPES as readonly string[]).includes(searchParams.type ?? "") ? (searchParams.type as DeletedType) : "contacts";
  const cutoff = recycleCutoff();
  const [rows, counts] = await Promise.all([
    loadRows(v.account.id, type),
    Promise.all(DELETED_TYPES.map(async (t) => {
      const model = { contacts: "contact", organizations: "organization", lists: "list", releases: "release", coverage: "coverage", assets: "asset" }[t];
      return [t, await (db as any)[model].count({ where: { accountId: v.account.id, deletedAt: { not: null, gte: cutoff } } })] as const;
    })),
  ]);
  const countOf = Object.fromEntries(counts) as Record<DeletedType, number>;
  const canEdit = v.role !== "VIEWER";
  const isAdmin = v.role === "OWNER" || v.role === "ADMIN";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Deleted Items</h1>
      <p className="text-sm text-neutral-600">Deleted records stay here for 30 days, then a nightly job removes them for good. Restore anything you need back.</p>
      <nav className="flex flex-wrap gap-1" aria-label="Item type">
        {DELETED_TYPES.map((t) => <Link key={t} href={`/settings/deleted?type=${t}`} className={`rounded px-3 py-1.5 text-sm ${t === type ? "bg-accentSoft font-medium text-accent" : "hover:bg-neutral-100"}`} aria-current={t === type ? "page" : undefined}>{DELETED_LABELS[t]} <span className="text-xs text-neutral-500">{countOf[t]}</span></Link>)}
      </nav>

      {rows.length ? (
        <form action={async (fd: FormData) => { "use server"; const ids = fd.getAll("id").map(String); const op = String(fd.get("op") ?? "restore"); if (op === "purge") await purgeDeleted(type, ids); else await restoreDeleted(type, ids); }} className="card overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 text-sm">
            <span>{rows.length} item{rows.length === 1 ? "" : "s"}</span>
            {canEdit && (
              <div className="flex gap-2">
                <button className="btn btn-primary" name="op" value="restore">Restore selected</button>
                {isAdmin && <ConfirmButton title="Delete permanently" message="Selected items are removed now instead of at the end of the 30 days. This cannot be undone." confirmLabel="Delete permanently" name="op" value="purge">Delete permanently now</ConfirmButton>}
              </div>
            )}
          </div>
          <table className="data">
            <thead><tr>{canEdit && <th className="w-8"></th>}<th>{type === "releases" || type === "coverage" ? "Headline" : "Name"}</th><th>Deleted</th><th>Permanent deletion</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const left = daysLeft(r.deletedAt);
                return (
                  <tr key={r.id}>
                    {canEdit && <td><input type="checkbox" name="id" value={r.id} aria-label={`Select ${r.label}`} /></td>}
                    <td><span className="font-medium">{r.label}</span>{r.sub && <span className="block text-xs text-neutral-500">{r.sub}</span>}</td>
                    <td className="text-sm">{r.deletedAt.toLocaleString()}</td>
                    <td className="text-sm"><span className={`pill ${left <= 3 ? "bg-red-50 text-bad" : left <= 7 ? "bg-amber-50 text-warn" : "bg-neutral-100 text-neutral-700"}`}>{left === 0 ? "tonight" : `in ${left} day${left === 1 ? "" : "s"}`}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </form>
      ) : (
        <div className="card p-10 text-center"><p className="mb-1 font-medium">No deleted {DELETED_LABELS[type].toLowerCase()}.</p><p className="text-sm text-neutral-600">Anything deleted in the last 30 days shows up here.</p></div>
      )}
    </div>
  );
}
