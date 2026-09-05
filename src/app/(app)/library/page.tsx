import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { urlFor } from "@/lib/storage";
import { ASSET_KINDS, KIND_LABELS, formatBytes, isImageMime } from "@/lib/library/kinds";
import { assetOrder, buildAssetWhere, buildFolderTree, libraryQuery, parseLibraryParams } from "@/lib/library/query";
import { createVideoLink } from "@/server/library";
import { FolderTree } from "@/components/library/FolderTree";
import { Uploader } from "@/components/library/Uploader";
import { LibraryBrowser, type AssetRow } from "@/components/library/LibraryBrowser";
import { AssetPanel } from "@/components/library/AssetPanel";

export default async function LibraryPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const v = await requireViewer();
  const f = parseLibraryParams(searchParams);
  if (f.folder === "deleted") f.deleted = true;
  const a = v.account.id;
  const canWrite = v.role !== "VIEWER";
  const where = buildAssetWhere(f, a);
  const [total, rows, folders, folderCounts, allCount, unfiledCount, deletedCount, usage, tagRows] = await Promise.all([
    db.asset.count({ where }),
    db.asset.findMany({ where, orderBy: assetOrder(f.sort), skip: (f.page - 1) * f.per, take: f.per, include: { folder: { select: { name: true } }, _count: { select: { releases: true, attachments: true } } } }),
    db.folder.findMany({ where: { accountId: a }, orderBy: { name: "asc" } }),
    db.asset.groupBy({ by: ["folderId"], where: { accountId: a, deletedAt: null }, _count: { _all: true } }),
    db.asset.count({ where: { accountId: a, deletedAt: null } }),
    db.asset.count({ where: { accountId: a, deletedAt: null, folderId: null } }),
    db.asset.count({ where: { accountId: a, deletedAt: { not: null } } }),
    db.asset.aggregate({ where: { accountId: a, deletedAt: null }, _sum: { size: true } }),
    db.asset.findMany({ where: { accountId: a, deletedAt: null }, select: { tags: true } }),
  ]);
  const counts: Record<string, number> = {};
  for (const g of folderCounts as any[]) if (g.folderId) counts[g.folderId] = g._count._all;
  const tree = buildFolderTree(folders, counts);
  const tags = Array.from(new Set((tagRows as any[]).flatMap((r) => r.tags as string[]))).sort();
  const currentFolder = f.deleted ? "deleted" : f.folder;
  const folderId = f.folder !== "all" && f.folder !== "unfiled" && f.folder !== "deleted" ? f.folder : null;

  const assetRows: AssetRow[] = await Promise.all(rows.map(async (x: any) => ({
    id: x.id, name: x.name, kind: x.kind, mime: x.mime, size: x.size, width: x.width, height: x.height, tags: x.tags, folderId: x.folderId, folderName: x.folder?.name ?? null,
    createdAt: x.createdAt.toISOString(), inMediaKit: x.inMediaKit, deleted: !!x.deletedAt, usedIn: x._count.releases + x._count.attachments,
    thumbUrl: x.kind !== "video_link" && x.externalUrl ? x.externalUrl : isImageMime(x.mime) && x.storageKey ? await urlFor(x.storageKey) : null,
  })));

  const href = (patch: Record<string, unknown>) => `/library${libraryQuery(f, { asset: "", page: 1, ...patch } as any)}`;
  const hrefForFolder = (folder: string) => (folder === "deleted" ? href({ folder: "all", deleted: true }) : href({ folder, deleted: false }));
  const pages = Math.max(1, Math.ceil(total / f.per));
  const filtered = !!(f.q || f.kind || f.tag);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Resource Library</h1>
          <p className="text-xs text-neutral-500">{allCount} files · {formatBytes(usage._sum.size ?? 0)} stored{deletedCount ? ` · ${deletedCount} in deleted items` : ""}</p>
        </div>
        {canWrite && (
          <details className="relative">
            <summary className="btn cursor-pointer list-none">Add video link</summary>
            <form action={createVideoLink} className="absolute right-0 z-20 mt-1 w-72 space-y-2 rounded-md border border-line bg-white p-3 shadow-lg">
              <input type="hidden" name="folderId" value={folderId ?? ""} />
              <div><label className="label" htmlFor="vl-name">Name</label><input id="vl-name" name="name" className="input" required /></div>
              <div><label className="label" htmlFor="vl-url">Video URL</label><input id="vl-url" name="externalUrl" type="url" className="input" placeholder="https://youtube.com/…" required /></div>
              <div><label className="label" htmlFor="vl-tags">Tags</label><input id="vl-tags" name="tags" className="input" placeholder="comma, separated" /></div>
              <button className="btn btn-primary w-full justify-center">Add link</button>
            </form>
          </details>
        )}
      </div>

      <div className={`grid gap-4 ${f.asset ? "lg:grid-cols-[13rem_1fr_22rem]" : "lg:grid-cols-[13rem_1fr]"}`}>
        <FolderTree tree={tree} current={currentFolder} counts={{ all: allCount, unfiled: unfiledCount, deleted: deletedCount }} hrefFor={hrefForFolder} canWrite={canWrite} />

        <div className="min-w-0">
          {!f.deleted && <div className="mb-3"><Uploader folderId={folderId} canWrite={canWrite} /></div>}
          {f.deleted && <p className="mb-3 rounded bg-neutral-100 px-3 py-2 text-xs text-neutral-600">Deleted items. Select files and choose Restore to bring them back.</p>}

          <form className="mb-2 flex flex-wrap items-center gap-2 text-sm" action="/library">
            {f.folder !== "all" && <input type="hidden" name="folder" value={f.folder} />}
            {f.deleted && <input type="hidden" name="deleted" value="1" />}
            {f.view !== "grid" && <input type="hidden" name="view" value={f.view} />}
            <input name="q" defaultValue={f.q} className="input w-48" placeholder="Search files" aria-label="Search files" />
            <select name="kind" defaultValue={f.kind} className="input w-36" aria-label="Kind"><option value="">All kinds</option>{ASSET_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}</select>
            <select name="tag" defaultValue={f.tag} className="input w-36" aria-label="Tag"><option value="">All tags</option>{tags.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <select name="sort" defaultValue={f.sort} className="input w-32" aria-label="Sort"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name</option><option value="size">Largest</option></select>
            <button className="btn">Apply</button>
            {filtered && <Link href={href({ q: "", kind: "", tag: "" })} className="text-xs underline">Clear</Link>}
            <span className="ml-auto flex overflow-hidden rounded-md border border-line" role="group" aria-label="View">
              <Link href={href({ view: "grid", page: f.page })} className={`px-2.5 py-1.5 ${f.view === "grid" ? "bg-accentSoft text-accent" : "bg-white"}`} aria-label="Grid view">▦</Link>
              <Link href={href({ view: "table", page: f.page })} className={`px-2.5 py-1.5 ${f.view === "table" ? "bg-accentSoft text-accent" : "bg-white"}`} aria-label="Table view">▤</Link>
            </span>
          </form>

          <p className="mb-2 text-xs text-neutral-500">Showing {total ? (f.page - 1) * f.per + 1 : 0} to {Math.min(total, f.page * f.per)} of {total}</p>
          <LibraryBrowser rows={assetRows} view={f.view} folders={folders.map((x: any) => ({ id: x.id, name: x.name }))} assetHref={`/library${libraryQuery(f, { asset: "__ID__" })}`} canWrite={canWrite} deletedView={f.deleted} />

          {!total && (
            <div className="card mt-2 p-10 text-center">
              <p className="mb-1 font-medium">{f.deleted ? "Nothing in deleted items." : filtered ? "No files match." : "No files yet."}</p>
              <p className="text-sm text-neutral-600">{f.deleted ? "Deleted files show here for 30 days." : filtered ? "Try another search or clear the filters." : "Drop logos, headshots and PDFs above. Anything marked for the media kit appears on your public newsroom."}</p>
            </div>
          )}
          {pages > 1 && (
            <nav className="mt-3 flex items-center gap-2 text-xs" aria-label="Pages">
              <Link href={href({ page: f.page - 1 })} className={`btn px-2 py-0.5 ${f.page <= 1 ? "pointer-events-none opacity-40" : ""}`}>‹</Link>
              <span>Page {f.page} of {pages}</span>
              <Link href={href({ page: f.page + 1 })} className={`btn px-2 py-0.5 ${f.page >= pages ? "pointer-events-none opacity-40" : ""}`}>›</Link>
            </nav>
          )}
        </div>

        {f.asset && <AssetPanel assetId={f.asset} folders={folders.map((x: any) => ({ id: x.id, name: x.name }))} closeHref={`/library${libraryQuery(f, { asset: "" })}`} canWrite={canWrite} />}
      </div>
    </div>
  );
}
