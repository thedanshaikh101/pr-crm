// Newsroom article renderer. Independent of the releases module's email renderer on purpose:
// the public page only needs sanitized HTML plus the boilerplate and media contact blocks.
import { cleanHtml, excerpt } from "@/lib/html";

export type ArticleInput = {
  headline: string;
  subheadline?: string | null;
  body: string;
  kind?: "PRESS_RELEASE" | "NEWSLETTER" | string;
  boilerplateHtml?: string | null;
  mediaContactHtml?: string | null;
};

export function formatDateline(city: string | null | undefined, date: Date | string | null | undefined, timeZone = "UTC") {
  const d = date ? new Date(date) : null;
  let when = "";
  if (d && !Number.isNaN(d.getTime())) {
    try { when = new Intl.DateTimeFormat("en-US", { timeZone, month: "long", day: "numeric", year: "numeric" }).format(d); }
    catch { when = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(d); }
  }
  const c = (city ?? "").trim().toUpperCase();
  return [c, when].filter(Boolean).join(", ");
}

/** Body plus optional "About" and "Media contact" sections, all sanitized. Never includes scripts. */
export function renderArticleHtml(input: ArticleInput) {
  const parts: string[] = [];
  parts.push(`<div class="nr-body">${cleanHtml(input.body ?? "")}</div>`);
  const bp = (input.boilerplateHtml ?? "").trim();
  if (bp) parts.push(`<section class="nr-boilerplate"><h2>About</h2>${cleanHtml(bp)}</section>`);
  const mc = (input.mediaContactHtml ?? "").trim();
  if (mc) parts.push(`<section class="nr-media-contact"><h2>Media contact</h2>${cleanHtml(mc)}</section>`);
  return parts.join("\n");
}

export function articleExcerpt(body: string, n = 160) {
  return excerpt(body ?? "", n);
}

/** JSON-LD NewsArticle. Pure so it can be tested without React. */
export function newsArticleJsonLd(a: { headline: string; description: string; url: string; image?: string | null; datePublished?: Date | string | null; dateModified?: Date | string | null; publisher: string; publisherLogo?: string | null }) {
  const o: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: a.headline,
    description: a.description,
    url: a.url,
    mainEntityOfPage: a.url,
    publisher: { "@type": "Organization", name: a.publisher, ...(a.publisherLogo ? { logo: { "@type": "ImageObject", url: a.publisherLogo } } : {}) },
  };
  if (a.image) o.image = [a.image];
  if (a.datePublished) o.datePublished = new Date(a.datePublished).toISOString();
  if (a.dateModified) o.dateModified = new Date(a.dateModified).toISOString();
  return o;
}
