/** Regex strip is enough for counting; the sanitizer stays server-side. */
const stripTags = (html: string) => (html ?? "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export type Badge = { key: string; label: string; ok: boolean; level: "good" | "warn" | "neutral"; detail?: string };

export type AnalyzeInput = {
  headline: string;
  subheadline?: string | null;
  body: string; // html
  featuredImageUrl?: string | null;
  boilerplateId?: string | null;
  mediaContactId?: string | null;
  embargoUntil?: string | Date | null;
};

export const HEADLINE_MAX = 110;
const WPM = 230;

export function wordCount(html: string) {
  const t = stripTags(html ?? "");
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

export function readingTimeMinutes(words: number) {
  return Math.max(1, Math.round(words / WPM));
}

export function linkCount(html: string) {
  return (html?.match(/<a\s[^>]*href=/gi) ?? []).length;
}

/** Right-rail badges shown on the editor. Pure so it unit-tests without React. */
export function analyzeRelease(i: AnalyzeInput): Badge[] {
  const words = wordCount(i.body);
  const links = linkCount(i.body);
  const hl = (i.headline ?? "").trim().length;
  return [
    { key: "words", label: `${words} words`, ok: words > 0, level: words > 0 ? "neutral" : "warn", detail: words ? `${readingTimeMinutes(words)} min read` : "Body is empty" },
    { key: "headline", label: hl > HEADLINE_MAX ? `Headline is long (${hl} chars)` : `Headline ${hl} chars`, ok: hl > 0 && hl <= HEADLINE_MAX, level: hl === 0 ? "warn" : hl > HEADLINE_MAX ? "warn" : "good", detail: hl > HEADLINE_MAX ? `Keep it under ${HEADLINE_MAX}` : undefined },
    { key: "subheadline", label: i.subheadline?.trim() ? "Subheadline set" : "No subheadline", ok: !!i.subheadline?.trim(), level: i.subheadline?.trim() ? "good" : "neutral" },
    { key: "image", label: i.featuredImageUrl ? "Featured image" : "No featured image", ok: !!i.featuredImageUrl, level: i.featuredImageUrl ? "good" : "neutral" },
    { key: "boilerplate", label: i.boilerplateId ? "Boilerplate" : "No boilerplate", ok: !!i.boilerplateId, level: i.boilerplateId ? "good" : "warn" },
    { key: "mediaContact", label: i.mediaContactId ? "Media contact" : "No media contact", ok: !!i.mediaContactId, level: i.mediaContactId ? "good" : "warn" },
    { key: "links", label: `${links} link${links === 1 ? "" : "s"}`, ok: true, level: "neutral" },
    { key: "embargo", label: i.embargoUntil ? "Embargo set" : "No embargo", ok: true, level: i.embargoUntil ? "warn" : "neutral", detail: i.embargoUntil ? new Date(i.embargoUntil).toLocaleString() : undefined },
  ];
}
