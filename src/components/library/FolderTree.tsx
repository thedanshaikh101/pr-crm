import Link from "next/link";
import { createFolder, deleteFolder, renameFolder } from "@/server/library";
import type { FolderNode } from "@/lib/library/query";

function Node({ n, current, hrefFor, canWrite, depth }: { n: FolderNode; current: string; hrefFor: (folder: string) => string; canWrite: boolean; depth: number }) {
  const active = current === n.id;
  const empty = n.count === 0 && n.children.length === 0;
  return (
    <li>
      <div className={`group flex items-center gap-1 rounded px-1 py-0.5 text-sm ${active ? "bg-accentSoft text-accent" : "hover:bg-neutral-100"}`} style={{ paddingLeft: `${depth * 12 + 4}px` }}>
        <Link href={hrefFor(n.id)} className="min-w-0 flex-1 truncate">📁 {n.name} <span className="text-xs text-neutral-400">{n.count || ""}</span></Link>
        {canWrite && (
          <details className="relative">
            <summary className="cursor-pointer list-none rounded px-1 text-xs text-neutral-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-neutral-700" aria-label={`Folder actions for ${n.name}`}>⋯</summary>
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-line bg-white p-2 text-xs shadow-lg">
              <form action={renameFolder.bind(null, n.id)} className="mb-2 flex gap-1"><input name="name" defaultValue={n.name} className="input" aria-label="New folder name" required /><button className="btn">Rename</button></form>
              <form action={createFolder} className="mb-2 flex gap-1"><input type="hidden" name="parentId" value={n.id} /><input name="name" placeholder="New subfolder" className="input" aria-label="Subfolder name" required /><button className="btn">Add</button></form>
              {empty
                ? <form action={deleteFolder.bind(null, n.id)}><button className="btn btn-danger w-full justify-center">Delete folder</button></form>
                : <p className="text-neutral-500">Empty the folder to delete it.</p>}
            </div>
          </details>
        )}
      </div>
      {n.children.length > 0 && <ul>{n.children.map((c) => <Node key={c.id} n={c} current={current} hrefFor={hrefFor} canWrite={canWrite} depth={depth + 1} />)}</ul>}
    </li>
  );
}

export function FolderTree({ tree, current, counts, hrefFor, canWrite }: { tree: FolderNode[]; current: string; counts: { all: number; unfiled: number; deleted: number }; hrefFor: (folder: string) => string; canWrite: boolean }) {
  const root = (key: string, label: string, n: number) => (
    <li><Link href={hrefFor(key)} className={`flex items-center justify-between rounded px-1 py-0.5 text-sm ${current === key ? "bg-accentSoft text-accent" : "hover:bg-neutral-100"}`}><span>{label}</span><span className="text-xs text-neutral-400">{n}</span></Link></li>
  );
  return (
    <nav className="card p-2" aria-label="Folders">
      <ul className="space-y-0.5">
        {root("all", "All files", counts.all)}
        {root("unfiled", "Unfiled", counts.unfiled)}
        {tree.map((n) => <Node key={n.id} n={n} current={current} hrefFor={hrefFor} canWrite={canWrite} depth={0} />)}
        {root("deleted", "Deleted items", counts.deleted)}
      </ul>
      {canWrite && (
        <form action={createFolder} className="mt-3 flex gap-1 border-t border-line pt-2">
          <input name="name" placeholder="New folder" className="input" aria-label="New folder name" required />
          <button className="btn">Add</button>
        </form>
      )}
    </nav>
  );
}
