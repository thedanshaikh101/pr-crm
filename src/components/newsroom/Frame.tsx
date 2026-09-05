import Link from "next/link";
import { cleanHtml } from "@/lib/html";
import type { Newsroom } from "@/lib/newsroom/data";
import { fontStack, googleFontHref, safeColor } from "@/lib/newsroom/theme";
import { Socials } from "./Socials";

const CSS = `
.newsroom { --nr-primary: #1F5FBF; min-height: 100vh; display: flex; flex-direction: column; background: #fff; color: #1C1F26; }
.newsroom a { color: inherit; }
.newsroom .nr-link { color: var(--nr-primary); }
.newsroom .prose a { color: var(--nr-primary); }
.newsroom .prose img { border-radius: 0.5rem; }
.newsroom .nr-body p:first-of-type { font-size: 1.05em; }
.newsroom .nr-boilerplate, .newsroom .nr-media-contact { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #E3E4E0; }
.newsroom .nr-boilerplate h2, .newsroom .nr-media-contact h2 { font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; margin: 0 0 0.5rem; }
@media print {
  .newsroom { background: #fff; }
  .nr-noprint { display: none !important; }
  .newsroom .prose a { color: inherit; text-decoration: none; }
  .newsroom .prose a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 0.8em; color: #555; }
}
`;

export function NewsroomFrame({ nr, children }: { nr: Newsroom; children: React.ReactNode }) {
  const primary = safeColor(nr.settings.primaryColor);
  const font = googleFontHref(nr.settings.fontFamily);
  const style = { "--nr-primary": primary, fontFamily: fontStack(nr.settings.fontFamily) } as React.CSSProperties;
  const b = nr.base;
  const home = b || "/";

  if (nr.print) {
    return (
      <div className="newsroom print" style={style}>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        {font && <link rel="stylesheet" href={font} />}
        <main className="mx-auto w-full max-w-3xl px-6 py-8">{children}</main>
      </div>
    );
  }

  const nav = [
    { href: home, label: "Newsroom" },
    { href: `${b}/media-kit`, label: "Media Kit" },
    { href: `${b}/about`, label: "About" },
    ...(nr.settings.showRss ? [{ href: `${b}/feed.xml`, label: "RSS", external: true }] : []),
  ];

  return (
    <div className="newsroom" style={style}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {font && <link rel="stylesheet" href={font} />}
      {nr.settings.showRss && <link rel="alternate" type="application/rss+xml" title={`${nr.account.name} newsroom`} href={`${nr.canonicalBase}/feed.xml`} />}
      <header className="nr-noprint border-b border-line">
        {nr.settings.headerImageUrl && (
          <div className="h-32 w-full bg-neutral-200 bg-cover bg-center sm:h-44" style={{ backgroundImage: `url("${nr.settings.headerImageUrl.replace(/"/g, "%22")}")` }} role="img" aria-label={`${nr.account.name} header`} />
        )}
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
          <Link href={home} className="flex items-center gap-3 no-underline" aria-label={`${nr.account.name} newsroom home`}>
            {nr.settings.logoUrl
              ? <img src={nr.settings.logoUrl} alt={nr.account.name} className="h-10 w-auto max-w-[12rem] object-contain" />
              : <span className="text-xl font-bold" style={{ color: primary }}>{nr.account.name}</span>}
            <span className="hidden text-sm text-neutral-500 sm:inline">Newsroom</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Newsroom">
            {nav.map((n) => "external" in n && n.external
              ? <a key={n.label} href={n.href} className="rounded px-2.5 py-1.5 font-medium hover:bg-neutral-100">{n.label}</a>
              : <Link key={n.label} href={n.href} className="rounded px-2.5 py-1.5 font-medium hover:bg-neutral-100">{n.label}</Link>)}
          </nav>
          {nr.settings.showSearch && (
            <form action={home} method="get" role="search" className="ml-auto flex w-full items-center gap-1 sm:w-auto">
              <label htmlFor="nr-q" className="sr-only">Search releases</label>
              <input id="nr-q" name="q" type="search" placeholder="Search releases" className="input w-full sm:w-56" />
              <button className="btn" style={{ borderColor: primary, color: primary }}>Search</button>
            </form>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="nr-noprint border-t border-line bg-neutral-50">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 text-sm text-neutral-600 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="prose prose-sm max-w-none text-neutral-600">
            {nr.settings.footerHtml ? <div dangerouslySetInnerHTML={{ __html: cleanHtml(nr.settings.footerHtml) }} /> : <p>{nr.account.name} newsroom. Media enquiries welcome.</p>}
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Socials socials={nr.socials} />
            <p className="text-xs text-neutral-400">Powered by Pressdesk</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
