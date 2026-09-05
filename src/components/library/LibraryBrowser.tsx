"use client";
// Grid or table of assets with multi-select and a bulk action bar.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteAssets, moveAssets, restoreAssets, tagAssets } from "@/server/library";
import { fileIcon, formatBytes } from "@/lib/library/kinds";

export type AssetRow = {
  id: string; name: string; kind: string; mime: string | null; size: number | null; width: number | null; height: number | null; tags: string[];
  folderId: string | null; folderName: string | null; createdAt: string; thumbUrl: string | null; usedIn: number; deleted: boolean; inMediaKit: boolean;
};

export function LibraryBrowser({ rows, view, folders, hrefForAsset, canWrite, deletedView }: {
  rows: AssetRow[]; view: "grid" | "table"; folders: { id: string; name: string }[]; hrefForAsset: (id: string) => string; canWrite: boolean; deletedView: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const ids = Array.from(sel);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const run = (fn: () => Promise<void>) => start(async () => { setMsg(null); try { await fn(); setSel(new Set()); router.refresh(); } catch (e) { setMsg((e as Error).message); } });

  const Check = ({ id, name }: { id: string; name: string }) => canWrite ? <input type="checkbox" checked={sel.has(id)} onChange={() => toggle(id)} aria-label={`Select ${name}`} className="h-4 w-4" /> : null;

  return (
    <div>
      {canWrite && sel.size > 0 && (
        <div className="sticky top-0 z-20 mb-2 flex flex-wrap items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm shadow-sm" role="region" aria-label="Bulk actions">
          <span className="font-medium">{sel.size} selected</span>
          {!deletedView && (
            <>
              <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget).get("folder") as string; run(() => moveAssets(ids, f || null)); }}>
                <select name="folder" className="input w-40" aria-label="Move to folder" defaultValue=""><option value="">Unfiled</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                <button className="btn" disabled={pending}>Move</button>
              </form>
              <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const t = (new FormData(e.currentTarget).get("tag") as string).trim(); if (t) run(() => tagAssets(ids, t)); }}>
                <input name="tag" className="input w-36" placeholder="Add tag" aria-label="Tag to add" />
                <button className="btn" disabled={pending}>Tag</button>
              </form>
              <button className="btn btn-danger" disabled={pending} onClick={() => { if (confirm(`Move ${sel.size} file(s) to deleted items?`)) run(() => deleteAssets(ids)); }}>Delete</button>
            </>
          )}
          {deletedView && <button className="btn" disabled={pending} onClick={() => run(() => restoreAssets(ids))}>Restore</button>}
          <button className="ml-auto text-xs underline" onClick={() => setSel(new Set())}>Clear</button>
          {msg && <span className="w-full text-xs text-bad">{msg}</span>}
        </div>
      )}

      {view === "grid" ? (
        <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rows.map((a) => (
            <li key={a.id} className={`group relative overflow-hidden rounded-lg border bg-white ${sel.has(a.id) ? "border-accent ring-1 ring-accent" : "border-line"}`}>
              <span className="absolute left-2 top-2 z-10"><Check id={a.id} name={a.name} /></span>
              {a.inMediaKit && <span className="absolute right-2 top-2 z-10 rounded bg-white/90 px-1 text-[10px] font-medium text-accent" title="In media kit">Kit</span>}
              <Link href={hrefForAsset(a.id)} className="block">
                {a.thumbUrl ? <img src={a.thumbUrl} alt={a.name} className="h-32 w-full bg-neutral-100 object-cover" loading="lazy" /> : <div className="grid h-32 place-items-center bg-neutral-50 text-4xl" aria-hidden>{fileIcon(a.kind, a.mime)}</div>}
                <div className="p-2 text-xs">
                  <p className="truncate font-medium text-sm" title={a.name}>{a.name}</p>
                  <p className="text-neutral-500">{a.kind.replace("_", " ")}{a.size ? ` · ${formatBytes(a.size)}` : ""}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data">
            <thead><tr>{canWrite && <th className="w-8"><span className="sr-only">Select</span></th>}<th>Name</th><th>Kind</th><th>Size</th><th>Dimensions</th><th>Tags</th><th>Folder</th><th>Added</th><th>Used in</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  {canWrite && <td><Check id={a.id} name={a.name} /></td>}
                  <td><Link href={hrefForAsset(a.id)} className="flex items-center gap-2 font-medium hover:underline"><span aria-hidden>{fileIcon(a.kind, a.mime)}</span><span className="truncate">{a.name}</span>{a.inMediaKit && <span className="pill bg-accentSoft text-accent">kit</span>}</Link></td>
                  <td>{a.kind.replace("_", " ")}</td>
                  <td className="whitespace-nowrap">{a.size ? formatBytes(a.size) : ""}</td>
                  <td className="whitespace-nowrap">{a.width && a.height ? `${a.width} x ${a.height}` : ""}</td>
                  <td className="text-xs">{a.tags.map((t) => <span key={t} className="chip mr-1">{t}</span>)}</td>
                  <td>{a.folderName ?? <span className="text-neutral-400">Unfiled</span>}</td>
                  <td className="whitespace-nowrap">{new Date(a.createdAt).toLocaleDateString()}</td>
                  <td>{a.usedIn || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
