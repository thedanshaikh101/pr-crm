import { cleanHtml } from "@/lib/html";
import type { Newsroom } from "@/lib/newsroom/data";
import { mediaContactFor, mediaKitAssets } from "@/lib/newsroom/data";
import { fileIcon, formatBytes, groupForMediaKit, isImageMime } from "@/lib/library/kinds";

export function publicAssetPath(token: string) { return `/api/library/public/${token}`; }

export async function NewsroomMediaKitPage({ nr }: { nr: Newsroom }) {
  const [assets, contact] = await Promise.all([mediaKitAssets(nr.account.id), mediaContactFor(nr.account.id, null)]);
  const groups = groupForMediaKit(assets);
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Media kit</h1>
      {nr.settings.mediaKitHtml && <div className="prose mb-8 max-w-3xl" dangerouslySetInnerHTML={{ __html: cleanHtml(nr.settings.mediaKitHtml) }} />}
      {!groups.length && <div className="rounded-lg border border-dashed border-line p-10 text-center text-neutral-500">No downloadable assets yet.</div>}
      {groups.map((g) => (
        <section key={g.kind} className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">{g.label}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.assets.map((a: any) => {
              const href = publicAssetPath(a.publicToken);
              const img = a.externalUrl && a.kind !== "video_link" ? a.externalUrl : isImageMime(a.mime) ? href : null;
              return (
                <li key={a.id} className="overflow-hidden rounded-lg border border-line bg-white">
                  <a href={a.kind === "video_link" ? a.externalUrl ?? href : href} target="_blank" rel="noopener noreferrer" className="block">
                    {img
                      ? <img src={img} alt={a.name} className="h-40 w-full bg-neutral-100 object-contain" loading="lazy" />
                      : <div className="grid h-40 place-items-center bg-neutral-50 text-5xl" aria-hidden>{fileIcon(a.kind, a.mime)}</div>}
                  </a>
                  <div className="p-3 text-sm">
                    <p className="truncate font-medium" title={a.name}>{a.name}</p>
                    <p className="text-xs text-neutral-500">{[a.width && a.height ? `${a.width} x ${a.height}` : null, a.size ? formatBytes(a.size) : null].filter(Boolean).join(" · ") || (a.kind === "video_link" ? "Video" : "")}</p>
                    <p className="mt-2 flex gap-3 text-xs">
                      {a.kind === "video_link"
                        ? <a href={a.externalUrl ?? href} target="_blank" rel="noopener noreferrer" className="nr-link underline">Watch</a>
                        : <><a href={href} className="nr-link underline" download={a.name}>Download</a><a href={href} target="_blank" rel="noopener noreferrer" className="nr-link underline">Open</a></>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {contact && (
        <section className="mt-6 max-w-2xl border-t border-line pt-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Media contact</h2>
          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: cleanHtml(contact) }} />
        </section>
      )}
    </div>
  );
}
