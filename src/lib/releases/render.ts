import { cleanHtml } from "@/lib/html";
import { mergeFields } from "@/lib/email/provider";

export type RenderInput = {
  headline: string;
  subheadline?: string | null;
  datelineCity?: string | null;
  datelineDate?: Date | string | null;
  body: string; // HTML (for newsletters, pass the rendered blocks here)
  featuredImageUrl?: string | null;
  boilerplate?: string | null; // HTML
  footer?: string | null; // HTML
  mediaContact?: string | null; // HTML
  attachments?: { name: string; url: string }[];
};

export type RenderMode = "email" | "newsroom" | "print";

export type RenderOptions = {
  mode: RenderMode;
  wrapper?: { intro?: string | null; teaserMode?: boolean; newsroomUrl?: string | null };
  preheader?: string | null;
  unsubscribeUrl?: string | null;
  trackingPixelUrl?: string | null;
  accountName?: string | null;
  accent?: string | null;
};

const esc = (s: string | null | undefined) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONT = "font-family:Helvetica,Arial,sans-serif;";

export function formatDateline(city?: string | null, date?: Date | string | null) {
  const d = date ? new Date(date) : null;
  const ds = d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
  const c = (city ?? "").trim().toUpperCase();
  return [c, ds].filter(Boolean).join(", ");
}

function attachmentsHtml(list: { name: string; url: string }[] | undefined, email: boolean) {
  if (!list?.length) return "";
  const items = list.map((a) => `<li style="margin:2px 0;"><a href="${esc(a.url)}" style="color:#1F5FBF;">${esc(a.name)}</a></li>`).join("");
  return `<div style="${email ? FONT : ""}margin-top:18px;"><p style="font-size:13px;font-weight:bold;margin:0 0 4px;color:#555;">Attachments</p><ul style="font-size:14px;margin:0;padding-left:18px;">${items}</ul></div>`;
}

/** Clean article fragment used by the newsroom, print view, and inside the email body. Exported for the newsroom module. */
export function renderNewsroomArticle(input: RenderInput, opts: { email?: boolean } = {}) {
  const email = !!opts.email;
  const f = email ? FONT : "";
  const dateline = formatDateline(input.datelineCity, input.datelineDate);
  const body = cleanHtml(input.body ?? "");
  const p = (html: string | null | undefined) => (html?.trim() ? cleanHtml(html) : "");
  return [
    `<article class="pd-release" style="${f}color:#1C1F26;">`,
    input.featuredImageUrl ? `<img src="${esc(input.featuredImageUrl)}" alt="" width="${email ? 600 : ""}" style="display:block;width:100%;max-width:100%;height:auto;border:0;margin:0 0 16px;" />` : "",
    `<h1 style="${f}font-size:${email ? 24 : 30}px;line-height:1.25;margin:0 0 8px;">${esc(input.headline)}</h1>`,
    input.subheadline ? `<p class="pd-sub" style="${f}font-size:${email ? 16 : 18}px;line-height:1.4;color:#555;margin:0 0 12px;">${esc(input.subheadline)}</p>` : "",
    `<div class="pd-body" style="${f}font-size:16px;line-height:1.6;">`,
    dateline ? `<p><strong>${esc(dateline)}</strong>${body.trim().startsWith("<p") ? "" : " "}</p>` : "",
    body,
    `</div>`,
    p(input.boilerplate) ? `<div class="pd-boilerplate" style="${f}font-size:14px;line-height:1.5;color:#333;margin-top:22px;padding-top:12px;border-top:1px solid #E3E4E0;">${p(input.boilerplate)}</div>` : "",
    p(input.mediaContact) ? `<div class="pd-media-contact" style="${f}font-size:14px;line-height:1.5;margin-top:18px;"><p style="font-size:13px;font-weight:bold;margin:0 0 4px;color:#555;">Media contact</p>${p(input.mediaContact)}</div>` : "",
    attachmentsHtml(input.attachments, email),
    `</article>`,
  ].filter(Boolean).join("\n");
}

function emailShell(inner: string, opts: RenderOptions, title: string) {
  const pre = opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(opts.preheader)}</div>` : "";
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<!--[if mso]><style>table,td{font-family:Arial,sans-serif;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#F7F7F5;">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F7F5;"><tr><td align="center" style="padding:20px 8px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #E3E4E0;">
<tr><td style="padding:24px;">
${inner}
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
}

/** Render a release for email, the newsroom, or print. Sanitizes every HTML input. */
export function renderReleaseHtml(input: RenderInput, opts: RenderOptions) {
  const accent = opts.accent ?? "#1F5FBF";
  if (opts.mode === "newsroom") return renderNewsroomArticle(input);
  if (opts.mode === "print") {
    return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${esc(input.headline)}</title>
<style>body{font-family:Georgia,"Times New Roman",serif;max-width:720px;margin:32px auto;padding:0 20px;color:#111;} h1{font-size:26px;line-height:1.25;} img{max-width:100%;} .pd-body{font-size:15px;line-height:1.6;} a{color:#111;} @media print{body{margin:0;max-width:none;} a[href]:after{content:" (" attr(href) ")";font-size:11px;color:#555;}}</style>
</head><body>${renderNewsroomArticle(input)}${opts.accountName ? `<p style="margin-top:32px;font-size:12px;color:#666;">${esc(opts.accountName)}</p>` : ""}</body></html>`;
  }
  // email
  const intro = opts.wrapper?.intro?.trim() ? `<div class="pd-intro" style="${FONT}font-size:16px;line-height:1.55;color:#1C1F26;margin:0 0 20px;padding:0 0 16px;border-bottom:1px solid #E3E4E0;">${cleanHtml(opts.wrapper.intro)}</div>` : "";
  let main: string;
  if (opts.wrapper?.teaserMode) {
    const url = opts.wrapper.newsroomUrl ?? "#";
    main = [
      `<h1 style="${FONT}font-size:24px;line-height:1.25;margin:0 0 8px;color:#1C1F26;">${esc(input.headline)}</h1>`,
      input.subheadline ? `<p style="${FONT}font-size:16px;line-height:1.4;color:#555;margin:0 0 14px;">${esc(input.subheadline)}</p>` : "",
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;"><tr><td bgcolor="${accent}" style="border-radius:6px;"><a href="${esc(url)}" style="${FONT}display:inline-block;padding:11px 20px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Read the full release</a></td></tr></table>`,
      input.mediaContact?.trim() ? `<div style="${FONT}font-size:14px;line-height:1.5;margin-top:18px;"><p style="font-size:13px;font-weight:bold;margin:0 0 4px;color:#555;">Media contact</p>${cleanHtml(input.mediaContact)}</div>` : "",
    ].filter(Boolean).join("\n");
  } else {
    main = renderNewsroomArticle(input, { email: true });
  }
  const footer = input.footer?.trim() ? `<div class="pd-footer" style="${FONT}font-size:12px;line-height:1.5;color:#666;margin-top:24px;padding-top:12px;border-top:1px solid #E3E4E0;">${cleanHtml(input.footer)}</div>` : "";
  const unsub = opts.unsubscribeUrl
    ? `<p class="pd-unsub" style="${FONT}font-size:12px;color:#888;margin-top:16px;">You are receiving this because you are on a media list${opts.accountName ? ` at ${esc(opts.accountName)}` : ""}. <a href="${esc(opts.unsubscribeUrl)}" style="color:#888;">Unsubscribe</a></p>`
    : "";
  const pixel = opts.trackingPixelUrl ? `<img src="${esc(opts.trackingPixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;" />` : "";
  return emailShell([intro, main, footer, unsub, pixel].filter(Boolean).join("\n"), opts, input.headline);
}

/** Replace every http(s) href in anchors with fn(url). Skips mailto:, tel:, and anchors. */
export function rewriteLinks(html: string, fn: (url: string) => string) {
  let count = 0;
  const out = (html ?? "").replace(/(<a\b[^>]*?\bhref\s*=\s*)(["'])(https?:\/\/[^"']+)\2/gi, (_m, pre, q, url) => {
    count++;
    const decoded = url.replace(/&amp;/g, "&");
    return `${pre}${q}${fn(decoded).replace(/&/g, "&amp;")}${q}`;
  });
  return { html: out, count };
}

/** Merge-field substitution over rendered HTML ({{first_name|there}} and friends). */
export function personalise(html: string, vars: Record<string, string | null | undefined>) {
  return mergeFields(html ?? "", vars);
}

export function mergeVarsFor(c: { firstName?: string | null; lastName?: string | null; jobTitle?: string | null; email?: string | null; outlet?: string | null; name?: string | null }) {
  const first = c.firstName ?? (c.name ?? "").split(/\s+/)[0] ?? "";
  const last = c.lastName ?? (c.name ?? "").split(/\s+/).slice(1).join(" ");
  return { first_name: first, last_name: last, name: [first, last].filter(Boolean).join(" ") || c.name || "", outlet: c.outlet ?? "", job_title: c.jobTitle ?? "", email: c.email ?? "" };
}
