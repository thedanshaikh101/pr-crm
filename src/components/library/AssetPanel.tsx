import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { urlFor } from "@/lib/storage";
import { deleteAssets, restoreAssets, updateAsset } from "@/server/library";
import { ASSET_KINDS, fileIcon, formatBytes, isImageMime } from "@/lib/library/kinds";
import { CopyLinkButton } from "@/components/newsroom/CopyLinkButton";

/** Right-hand detail panel for ?asset=<id>. Server-rendered forms; only copy needs the client. */
export async function AssetPanel({ assetId, folders, closeHref, canWrite }: { assetId: string; folders: { id: string; name: string }[]; closeHref: string; canWrite: boolean }) {
  const v = await requireViewer();
  const a = await db.asset.findFirst({
    where: { id: assetId, accountId: v.account.id },
    include: { folder: { select: { name: true } }, releases: { include: { release: { select: { id: true, headline: true, status: true } } } }, attachments: { select: { id: true, entity: true, entityId: true, conversationId: true } } },
  });
  if (!a) return <aside className="card p-4 text-sm"><p>File not found.</p><Link href={closeHref} className="btn mt-2">Close</Link></aside>;
  const fileUrl = a.externalUrl ?? (a.storageKey ? await urlFor(a.storageKey) : null);
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const publicUrl = `${appUrl}/api/library/public/${a.publicToken}`;
  const isImg = a.kind !== "video_link" && (isImageMime(a.mime) || (!!a.externalUrl && ["image", "logo", "headshot"].includes(a.kind)));
  const isPdf = a.mime === "application/pdf" || a.kind === "pdf";
  const F = ({ children }: { children: React.ReactNode }) => <div className="text-xs">{children}</div>;

  return (
    <aside className="card sticky top-4 self-start p-4 text-sm" aria-label="File details">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="min-w-0 truncate font-semibold" title={a.name}>{a.name}</h2>
        <Link href={closeHref} className="btn px-2 py-0.5" aria-label="Close panel">✕</Link>
      </div>
      {a.deletedAt && <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-bad">In deleted items since {a.deletedAt.toLocaleDateString()}.</p>}

      <div className="mb-3 overflow-hidden rounded-md border border-line bg-neutral-50">
        {isImg && fileUrl ? <img src={fileUrl} alt={a.name} className="max-h-56 w-full object-contain" />
          : isPdf && fileUrl ? <iframe src={fileUrl} title={a.name} className="h-56 w-full" />
          : a.kind === "video_link" && a.externalUrl ? <a href={a.externalUrl} target="_blank" rel="noopener noreferrer" className="block p-6 text-center"><span className="block text-4xl" aria-hidden>🎬</span><span className="mt-1 block truncate text-xs underline">{a.externalUrl}</span></a>
          : <div className="grid h-32 place-items-center text-4xl" aria-hidden>{fileIcon(a.kind, a.mime)}</div>}
      </div>
      <p className="mb-3 text-xs text-neutral-500">{[a.kind.replace("_", " "), a.mime, a.size ? formatBytes(a.size) : null, a.width && a.height ? `${a.width} x ${a.height}` : null, `added ${a.createdAt.toLocaleDateString()}`].filter(Boolean).join(" · ")}</p>

      {canWrite && !a.deletedAt ? (
        <form action={updateAsset.bind(null, a.id)} className="space-y-2">
          <div><label className="label" htmlFor="ap-name">Name</label><input id="ap-name" name="name" defaultValue={a.name} className="input" required /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label" htmlFor="ap-kind">Kind</label><select id="ap-kind" name="kind" defaultValue={a.kind} className="input">{ASSET_KINDS.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</select></div>
            <div><label className="label" htmlFor="ap-folder">Folder</label><select id="ap-folder" name="folderId" defaultValue={a.folderId ?? ""} className="input"><option value="">Unfiled</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
          </div>
          {a.kind === "video_link" && <div><label className="label" htmlFor="ap-url">Video URL</label><input id="ap-url" name="externalUrl" type="url" defaultValue={a.externalUrl ?? ""} className="input" /></div>}
          <div><label className="label" htmlFor="ap-tags">Tags (comma separated)</label><input id="ap-tags" name="tags" defaultValue={a.tags.join(", ")} className="input" /></div>
          <input type="hidden" name="inMediaKit" value="off" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="inMediaKit" value="on" defaultChecked={a.inMediaKit} /> Show in the public media kit</label>
          <button className="btn btn-primary">Save</button>
        </form>
      ) : (
        <F>
          <p>Kind: {a.kind.replace("_", " ")} · Folder: {a.folder?.name ?? "Unfiled"}</p>
          <p>Tags: {a.tags.length ? a.tags.join(", ") : "none"} · {a.inMediaKit ? "In media kit" : "Not in media kit"}</p>
        </F>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <p className="label">Public link</p>
        <div className="flex items-center gap-1"><input readOnly value={publicUrl} className="input text-xs" aria-label="Public link" /><CopyLinkButton url={publicUrl} label="Copy" /></div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {a.kind === "video_link" ? <a href={a.externalUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="btn">Open link</a> : <a href={`/api/library/${a.id}/download`} className="btn">Download</a>}
          {fileUrl && a.kind !== "video_link" && <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="btn">Open</a>}
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <p className="label">Used in</p>
        {!a.releases.length && !a.attachments.length && <p className="text-xs text-neutral-500">Not attached to anything yet.</p>}
        <ul className="space-y-1 text-xs">
          {a.releases.map((r: any) => <li key={r.releaseId}><Link href={`/releases/${r.release.id}`} className="underline">{r.release.headline}</Link> <span className="text-neutral-400">release · {r.release.status.toLowerCase()}</span></li>)}
          {a.attachments.map((x: any) => <li key={x.id}><Link href={x.conversationId ? `/response-desk/conversations/${x.conversationId}` : "/response-desk"} className="underline capitalize">{x.entity}</Link> <span className="text-neutral-400">response desk</span></li>)}
        </ul>
      </div>

      {canWrite && (
        <div className="mt-4 border-t border-line pt-3">
          {a.deletedAt
            ? <form action={async () => { "use server"; await restoreAssets([a.id]); }}><button className="btn">Restore</button></form>
            : <form action={async () => { "use server"; await deleteAssets([a.id]); }}><button className="btn btn-danger">Delete</button></form>}
        </div>
      )}
    </aside>
  );
}
