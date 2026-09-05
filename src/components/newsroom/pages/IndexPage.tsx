import Link from "next/link";
import type { Newsroom } from "@/lib/newsroom/data";
import { listReleases, tagsInUse } from "@/lib/newsroom/data";
import { Pager, ReleaseList } from "../ReleaseCard";

export type IndexSearch = { q?: string; tag?: string; page?: string };

export async function NewsroomIndexPage({ nr, searchParams }: { nr: Newsroom; searchParams: IndexSearch }) {
  const q = (searchParams.q ?? "").trim();
  const tag = (searchParams.tag ?? "").trim();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const [list, tags] = await Promise.all([listReleases(nr.account.id, { q, tag, page }), tagsInUse(nr.account.id)]);
  const hrefFor = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (tag) sp.set("tag", tag);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return `${nr.base || "/"}${s ? `?${s}` : ""}`;
  };
  const filtered = !!(q || tag);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_16rem]">
      <div>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">{tag ? `Tagged: ${tag}` : q ? `Results for "${q}"` : "Latest news"}</h1>
          <span className="text-sm text-neutral-500">{list.total} {list.total === 1 ? "release" : "releases"}{filtered && <> · <Link href={nr.base || "/"} className="nr-link underline">Clear</Link></>}</span>
        </div>
        <ReleaseList rows={list.rows} base={nr.base} timeZone={nr.account.timezone} empty={filtered ? "Nothing matches. Try another word or clear the filter." : "No releases published yet. Check back soon."} />
        <Pager page={list.page} pages={list.pages} hrefFor={hrefFor} />
      </div>
      <aside className="space-y-6 text-sm">
        {tags.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Topics</h2>
            <ul className="flex flex-wrap gap-1.5">
              {tags.map((t) => <li key={t.name}><Link href={`${nr.base}/tag/${encodeURIComponent(t.name)}`} className={`chip no-underline hover:underline ${tag.toLowerCase() === t.name.toLowerCase() ? "ring-2 ring-accent" : ""}`}>{t.name} <span className="opacity-60">{t.count}</span></Link></li>)}
            </ul>
          </section>
        )}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">For media</h2>
          <ul className="space-y-1">
            <li><Link href={`${nr.base}/media-kit`} className="nr-link underline">Media kit and assets</Link></li>
            <li><Link href={`${nr.base}/about`} className="nr-link underline">About {nr.account.name}</Link></li>
            {nr.settings.showRss && <li><a href={`${nr.base}/feed.xml`} className="nr-link underline">RSS feed</a></li>}
          </ul>
        </section>
      </aside>
    </div>
  );
}
