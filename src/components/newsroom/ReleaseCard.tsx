import Link from "next/link";
import { formatDateline, articleExcerpt } from "@/lib/newsroom/article";
import type { ReleaseCard as Card } from "@/lib/newsroom/data";

export function ReleaseCard({ r, base, timeZone }: { r: Card; base: string; timeZone: string }) {
  const href = `${base}/${r.slug}`;
  const dateline = formatDateline(r.datelineCity, r.datelineDate ?? r.publishedAt, timeZone);
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-line bg-white sm:flex-row">
      {r.featuredImageUrl && (
        <Link href={href} className="block shrink-0 sm:w-56" aria-hidden tabIndex={-1}>
          <img src={r.featuredImageUrl} alt="" className="h-40 w-full object-cover sm:h-full" loading="lazy" />
        </Link>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-4">
        <p className="text-xs uppercase tracking-wide text-neutral-500">{dateline}{r.client?.name ? ` · ${r.client.name}` : ""}{r.kind === "NEWSLETTER" ? " · Newsletter" : ""}</p>
        <h2 className="text-lg font-semibold leading-snug"><Link href={href} className="hover:underline">{r.headline}</Link></h2>
        {r.subheadline && <p className="text-sm text-neutral-700">{r.subheadline}</p>}
        <p className="text-sm text-neutral-600">{articleExcerpt(r.body, 180)}</p>
        {r.tags.length > 0 && (
          <ul className="mt-auto flex flex-wrap gap-1 pt-1">
            {r.tags.map((t) => <li key={t.tag.name}><Link href={`${base}/tag/${encodeURIComponent(t.tag.name)}`} className="chip no-underline hover:underline">{t.tag.name}</Link></li>)}
          </ul>
        )}
      </div>
    </article>
  );
}

export function ReleaseList({ rows, base, timeZone, empty }: { rows: Card[]; base: string; timeZone: string; empty: string }) {
  if (!rows.length) return <div className="rounded-lg border border-dashed border-line p-10 text-center text-neutral-500">{empty}</div>;
  return <div className="space-y-4">{rows.map((r) => <ReleaseCard key={r.id} r={r} base={base} timeZone={timeZone} />)}</div>;
}

export function Pager({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pages">
      {page > 1 ? <Link href={hrefFor(page - 1)} className="btn">Newer</Link> : <span />}
      <span className="text-neutral-500">Page {page} of {pages}</span>
      {page < pages ? <Link href={hrefFor(page + 1)} className="btn">Older</Link> : <span />}
    </nav>
  );
}
