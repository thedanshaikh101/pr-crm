import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Newsroom } from "@/lib/newsroom/data";
import { getLiveRelease } from "@/lib/newsroom/data";
import { articleExcerpt, formatDateline, newsArticleJsonLd, renderArticleHtml } from "@/lib/newsroom/article";
import { canonicalReleaseUrl, envFromProcess } from "@/lib/newsroom/urls";
import { fileIcon, formatBytes } from "@/lib/library/kinds";
import { ShareLinks } from "../ShareLinks";
import { PageviewPing } from "../PageviewPing";
import { PrintButton } from "../CopyLinkButton";
import { publicAssetPath } from "./MediaKitPage";

export async function releaseMetadata(nr: Newsroom, releaseSlug: string): Promise<Metadata> {
  const found = await getLiveRelease(nr.account.id, releaseSlug);
  if (!found) return { title: "Not found" };
  const r = found.release;
  const url = canonicalReleaseUrl(nr.account, nr.settings, r, envFromProcess());
  const description = r.subheadline || articleExcerpt(r.body, 160);
  return {
    title: `${r.headline} | ${nr.account.name}`,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", title: r.headline, description, url, siteName: `${nr.account.name} newsroom`, publishedTime: (r.publishedAt ?? r.createdAt).toISOString(), modifiedTime: r.updatedAt.toISOString(), images: r.featuredImageUrl ? [{ url: r.featuredImageUrl }] : undefined },
    twitter: { card: r.featuredImageUrl ? "summary_large_image" : "summary", title: r.headline, description, images: r.featuredImageUrl ? [r.featuredImageUrl] : undefined },
  };
}

export async function NewsroomReleasePage({ nr, releaseSlug }: { nr: Newsroom; releaseSlug: string }) {
  const found = await getLiveRelease(nr.account.id, releaseSlug);
  if (!found) notFound();
  const { release: r, prev, next, boilerplateHtml, mediaContactHtml } = found;
  const url = canonicalReleaseUrl(nr.account, nr.settings, r, envFromProcess());
  const dateline = formatDateline(r.datelineCity, r.datelineDate ?? r.publishedAt, nr.account.timezone);
  const html = renderArticleHtml({ headline: r.headline, subheadline: r.subheadline, body: r.body, kind: r.kind, boilerplateHtml, mediaContactHtml });
  const jsonLd = newsArticleJsonLd({ headline: r.headline, description: r.subheadline || articleExcerpt(r.body), url, image: r.featuredImageUrl, datePublished: r.publishedAt ?? r.createdAt, dateModified: r.updatedAt, publisher: nr.account.name, publisherLogo: nr.settings.logoUrl });
  const assets = r.attachments.map((x: any) => x.asset).filter((a: any) => !a.deletedAt);
  const tags = r.tags.map((t: any) => t.tag.name as string);

  return (
    <article className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {!nr.print && <PageviewPing releaseId={r.id} />}
      {!nr.print && <p className="nr-noprint mb-3 text-sm"><Link href={nr.base || "/"} className="nr-link underline">All news</Link></p>}
      {nr.print && <p className="mb-4 text-xs uppercase tracking-wide text-neutral-500">{nr.account.name} · For immediate release</p>}
      <header className="mb-5">
        <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">{r.kind === "NEWSLETTER" ? "Newsletter" : "Press release"}{r.client?.name ? ` · ${r.client.name}` : ""}</p>
        <h1 className="text-3xl font-bold leading-tight">{r.headline}</h1>
        {r.subheadline && <p className="mt-2 text-lg text-neutral-700">{r.subheadline}</p>}
      </header>
      {r.featuredImageUrl && !nr.print && <img src={r.featuredImageUrl} alt="" className="mb-6 w-full rounded-lg object-cover" />}
      <div className="prose max-w-none">
        {dateline && <p className="nr-dateline"><strong>{dateline}</strong></p>}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      {assets.length > 0 && (
        <section className="mt-8 border-t border-line pt-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Assets</h2>
          <ul className="divide-y divide-line text-sm">
            {assets.map((a: any) => (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <span aria-hidden>{fileIcon(a.kind, a.mime)}</span>
                <span className="min-w-0 flex-1 truncate">{a.name} <span className="text-xs text-neutral-500">{a.kind.replace("_", " ")}{a.size ? ` · ${formatBytes(a.size)}` : ""}</span></span>
                <a href={a.kind === "video_link" && a.externalUrl ? a.externalUrl : publicAssetPath(a.publicToken)} className="nr-link underline" target="_blank" rel="noopener noreferrer">{a.kind === "video_link" ? "Watch" : "Download"}</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tags.length > 0 && (
        <ul className="mt-6 flex flex-wrap gap-1.5" aria-label="Tags">
          {tags.map((t) => <li key={t}><Link href={`${nr.base}/tag/${encodeURIComponent(t)}`} className="chip no-underline hover:underline">{t}</Link></li>)}
        </ul>
      )}

      {nr.print ? (
        <p className="mt-8 text-xs text-neutral-500">Source: {url}</p>
      ) : (
        <div className="nr-noprint mt-8 space-y-4 border-t border-line pt-4">
          <ShareLinks url={url} title={r.headline} />
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href={`${nr.base}/${r.slug}?print=1`} className="btn">Print view</Link>
            <PrintButton />
          </div>
          <nav className="grid gap-2 text-sm sm:grid-cols-2" aria-label="More releases">
            {next ? <Link href={`${nr.base}/${next.slug}`} className="rounded-lg border border-line p-3 hover:bg-neutral-50"><span className="block text-xs text-neutral-500">Newer</span>{next.headline}</Link> : <span />}
            {prev ? <Link href={`${nr.base}/${prev.slug}`} className="rounded-lg border border-line p-3 text-right hover:bg-neutral-50"><span className="block text-xs text-neutral-500">Older</span>{prev.headline}</Link> : <span />}
          </nav>
        </div>
      )}
    </article>
  );
}
