// Server-side page fetch for the coverage URL importer. Bounded: 8 s, 2 MB, http(s) only.
import { extractArticleMeta, type ArticleMeta } from "./extract";

const MAX_BYTES = 2 * 1024 * 1024;
const UA = "Mozilla/5.0 (compatible; PressdeskBot/1.0; +https://pressdesk.local)";

export function assertFetchableUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new Error("That is not a valid URL."); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http and https URLs can be fetched.");
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h === "::1" || h === "[::1]") {
    throw new Error("Local and private addresses cannot be fetched.");
  }
  return u.toString();
}

export async function fetchHtml(url: string, timeoutMs = 8000): Promise<{ html: string; finalUrl: string }> {
  const target = assertFetchableUrl(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(target, { redirect: "follow", signal: ctrl.signal, headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "en-CA,en;q=0.8" } });
    if (!res.ok) throw new Error(`The page returned HTTP ${res.status}.`);
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !/html|xml|text\/plain/i.test(ct)) throw new Error(`Not an HTML page (${ct.split(";")[0]}).`);
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (res.body) {
      const reader = res.body.getReader();
      while (total < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) { chunks.push(value); total += value.length; }
      }
      try { await reader.cancel(); } catch { /* stream already closed */ }
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, MAX_BYTES);
    return { html: buf.toString("utf8"), finalUrl: res.url || target };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("The page took longer than 8 seconds to respond.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchArticleMeta(url: string, timeoutMs = 8000): Promise<ArticleMeta> {
  const { html, finalUrl } = await fetchHtml(url, timeoutMs);
  return extractArticleMeta(html, finalUrl);
}
