import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { excerpt } from "@/lib/html";
import { basePath, type Kind } from "@/lib/releases/data";
import { restoreVersion, saveVersion } from "@/server/releases";

export async function VersionsPage({ kind, id }: { kind: Kind; id: string }) {
  const v = await requireViewer();
  const r = await db.release.findFirst({ where: { id, accountId: v.account.id, deletedAt: null }, include: { versions: { orderBy: { version: "desc" } } } });
  if (!r) notFound();
  const users = await db.user.findMany({ where: { id: { in: Array.from(new Set(r.versions.map((x: any) => x.savedById))) } }, select: { id: true, name: true } });
  const who = (uid: string) => users.find((u: any) => u.id === uid)?.name ?? "Unknown";
  const base = basePath(kind);
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Link href={`${base}/${id}`} className="btn">← Back</Link>
        <h1 className="text-xl font-semibold">Versions of {r.headline}</h1>
        <form action={saveVersion.bind(null, id)} className="ml-auto"><button className="btn">Save current as version</button></form>
      </div>
      <div className="card divide-y divide-line">
        {r.versions.map((x: any) => { const s = x.snapshot ?? {}; return (
          <div key={x.id} className="flex items-start gap-4 p-4">
            <div className="w-14 shrink-0 text-center"><div className="text-lg font-semibold">v{x.version}</div></div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.headline ?? "(no headline)"}</p>
              <p className="line-clamp-2 text-sm text-neutral-600">{excerpt(s.body ?? "", 200) || (Array.isArray(s.blocks) ? `${s.blocks.length} blocks` : "")}</p>
              <p className="mt-1 text-xs text-neutral-500">{who(x.savedById)} · {x.createdAt.toLocaleString()}</p>
            </div>
            <form action={restoreVersion.bind(null, id, x.id)}><button className="btn">Restore</button></form>
          </div>
        ); })}
        {!r.versions.length && <p className="p-6 text-center text-sm text-neutral-500">No versions yet. Versions are recorded each time you Save or Publish.</p>}
      </div>
    </div>
  );
}
