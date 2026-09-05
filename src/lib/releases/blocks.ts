import { cleanHtml, excerpt, stripTags } from "@/lib/html";

export { BLOCK_TYPES, newBlockId, parseBlocks } from "./blockTypes";
export type { Block, BlockType } from "./blockTypes";
import type { Block } from "./blockTypes";

export type BlockContext = {
  /** Live releases the newsletter may reference, keyed by id. */
  releases: Record<string, { headline: string; subheadline?: string | null; body?: string | null; url: string; featuredImageUrl?: string | null }>;
  accent?: string;
};

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeUrl = (u: string) => (/^(https?:|mailto:)/i.test((u ?? "").trim()) ? u.trim() : "#");
const FONT = "font-family:Helvetica,Arial,sans-serif;";

/** Email-safe HTML (tables + inline styles, no flex/grid) for a block list. Pure. */
export function renderBlocks(blocks: Block[], ctx: BlockContext) {
  const accent = ctx.accent ?? "#1F5FBF";
  const parts: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "heading": {
        const size = b.level === 1 ? 26 : b.level === 3 ? 17 : 21;
        parts.push(`<h${b.level ?? 2} style="${FONT}font-size:${size}px;line-height:1.25;margin:20px 0 8px;color:#1C1F26;">${esc(b.text)}</h${b.level ?? 2}>`);
        break;
      }
      case "text":
        parts.push(`<div style="${FONT}font-size:16px;line-height:1.55;color:#1C1F26;">${cleanHtml(b.html)}</div>`);
        break;
      case "image": {
        if (!b.url) break;
        const img = `<img src="${esc(safeUrl(b.url))}" alt="${esc(b.alt ?? "")}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />`;
        parts.push(`<div style="margin:12px 0;">${b.href ? `<a href="${esc(safeUrl(b.href))}">${img}</a>` : img}</div>`);
        break;
      }
      case "release": {
        const r = ctx.releases[b.releaseId];
        if (!r) { parts.push(`<p style="${FONT}font-size:13px;color:#999;">(release not available)</p>`); break; }
        const ex = excerpt(r.body ?? "", 220);
        parts.push(
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0;border:1px solid #E3E4E0;border-radius:6px;"><tr><td style="padding:14px 16px;">` +
          (r.featuredImageUrl ? `<img src="${esc(r.featuredImageUrl)}" alt="" width="568" style="display:block;width:100%;max-width:568px;height:auto;border:0;margin-bottom:10px;" />` : "") +
          `<h3 style="${FONT}font-size:18px;line-height:1.3;margin:0 0 6px;color:#1C1F26;"><a href="${esc(r.url)}" style="color:#1C1F26;text-decoration:none;">${esc(r.headline)}</a></h3>` +
          (r.subheadline ? `<p style="${FONT}font-size:14px;color:#555;margin:0 0 6px;">${esc(r.subheadline)}</p>` : "") +
          (ex ? `<p style="${FONT}font-size:14px;line-height:1.5;color:#333;margin:0 0 10px;">${esc(ex)}</p>` : "") +
          `<a href="${esc(r.url)}" style="${FONT}font-size:14px;color:${accent};font-weight:bold;text-decoration:underline;">Read the full release</a>` +
          `</td></tr></table>`,
        );
        break;
      }
      case "button":
        if (!b.href) break;
        parts.push(
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;"><tr><td bgcolor="${accent}" style="border-radius:6px;">` +
          `<a href="${esc(safeUrl(b.href))}" style="${FONT}display:inline-block;padding:11px 20px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${esc(b.label || "Read more")}</a>` +
          `</td></tr></table>`,
        );
        break;
      case "divider":
        parts.push(`<hr style="border:0;border-top:1px solid #E3E4E0;margin:20px 0;" />`);
        break;
    }
  }
  return parts.join("\n");
}

/** Plain-text-ish summary of a block list for excerpts and word counts. */
export function blocksToText(blocks: Block[]) {
  return blocks.map((b) => (b.type === "heading" ? b.text : b.type === "text" ? stripTags(b.html) : b.type === "button" ? b.label : "")).filter(Boolean).join("\n");
}
