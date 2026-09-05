// Pure PDF layout for the coverage report (pdf-lib). No DB access; the route collects the data.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";

export type CoverageReportItem = {
  date: Date | string; outlet: string; headline: string; url: string | null; type: string; focus?: string; sentiment: string; reach: number | null; ave: number | null; pickups: number;
};
export type CoverageReportData = {
  title: string; // client name or account name
  accountName: string;
  logo?: { bytes: Uint8Array; type: "png" | "jpg" } | null;
  from?: Date | string | null;
  to?: Date | string | null;
  generatedAt?: Date;
  items: CoverageReportItem[];
};

const ACCENT = rgb(0x1f / 255, 0x5f / 255, 0xbf / 255);
const INK = rgb(0x1c / 255, 0x1f / 255, 0x26 / 255);
const MUTED = rgb(0.45, 0.47, 0.5);
const LINE = rgb(0.89, 0.89, 0.88);
const SOFT = rgb(0xe7 / 255, 0xee / 255, 0xfb / 255);
const SENT: Record<string, RGB> = { POSITIVE: rgb(0x2e / 255, 0x7d / 255, 0x4f / 255), NEUTRAL: MUTED, NEGATIVE: rgb(0xb2 / 255, 0x3b / 255, 0x3b / 255) };

const PAGE = { w: 612, h: 792, margin: 48 };

/** Helvetica is WinAnsi only; replace anything outside Latin-1 so encoding never throws. */
export function pdfSafe(s: string | null | undefined) {
  return (s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/–/g, "-").replace(/—/g, "-").replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  return isNaN(x.getTime()) ? "" : x.toISOString().slice(0, 10);
}
const num = (n: number | null | undefined) => (n == null ? "" : Math.round(n).toLocaleString("en-CA"));
const money = (n: number | null | undefined) => (n == null ? "" : "$" + Math.round(n).toLocaleString("en-CA"));
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

function truncate(font: PDFFont, text: string, size: number, maxWidth: number) {
  let t = pdfSafe(text);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "...", size) > maxWidth) t = t.slice(0, -1);
  return t.trimEnd() + "...";
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) cur = next;
    else { if (cur) lines.push(cur); cur = font.widthOfTextAtSize(w, size) <= maxWidth ? w : truncate(font, w, size, maxWidth); }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

type Ctx = { doc: PDFDocument; font: PDFFont; bold: PDFFont; pages: PDFPage[]; footerLabel: string };

function newPage(ctx: Ctx) {
  const page = ctx.doc.addPage([PAGE.w, PAGE.h]);
  ctx.pages.push(page);
  return page;
}

function footers(ctx: Ctx) {
  ctx.pages.forEach((p, i) => {
    p.drawLine({ start: { x: PAGE.margin, y: 36 }, end: { x: PAGE.w - PAGE.margin, y: 36 }, thickness: 0.5, color: LINE });
    p.drawText(pdfSafe(ctx.footerLabel), { x: PAGE.margin, y: 24, size: 8, font: ctx.font, color: MUTED });
    const label = `Page ${i + 1} of ${ctx.pages.length}`;
    p.drawText(label, { x: PAGE.w - PAGE.margin - ctx.font.widthOfTextAtSize(label, 8), y: 24, size: 8, font: ctx.font, color: MUTED });
  });
}

export async function buildCoveragePdf(data: CoverageReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const generated = data.generatedAt ?? new Date();
  const period = data.from || data.to ? `${fmtDate(data.from) || "Start"} to ${fmtDate(data.to) || fmtDate(generated)}` : "All time";
  const ctx: Ctx = { doc, font, bold, pages: [], footerLabel: `${data.accountName} - Coverage report - ${data.title}` };
  doc.setTitle(`Coverage report - ${pdfSafe(data.title)}`);
  doc.setAuthor(pdfSafe(data.accountName));
  const items = [...data.items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // ---- Cover
  const cover = newPage(ctx);
  cover.drawRectangle({ x: 0, y: PAGE.h - 160, width: PAGE.w, height: 160, color: ACCENT });
  cover.drawText("Coverage report", { x: PAGE.margin, y: PAGE.h - 100, size: 28, font: bold, color: rgb(1, 1, 1) });
  cover.drawText(pdfSafe(data.accountName), { x: PAGE.margin, y: PAGE.h - 128, size: 12, font, color: rgb(1, 1, 1) });
  let y = PAGE.h - 260;
  if (data.logo) {
    try {
      const img = data.logo.type === "png" ? await doc.embedPng(data.logo.bytes) : await doc.embedJpg(data.logo.bytes);
      const scale = Math.min(140 / img.width, 140 / img.height, 1);
      cover.drawImage(img, { x: PAGE.margin, y: y - img.height * scale + 20, width: img.width * scale, height: img.height * scale });
      y -= img.height * scale + 10;
    } catch { /* bad image bytes: skip silently */ }
  }
  for (const line of wrap(bold, data.title, 26, PAGE.w - 2 * PAGE.margin)) { cover.drawText(line, { x: PAGE.margin, y, size: 26, font: bold, color: INK }); y -= 32; }
  y -= 8;
  cover.drawText(`Period: ${period}`, { x: PAGE.margin, y, size: 12, font, color: MUTED }); y -= 18;
  cover.drawText(`Generated: ${generated.toISOString().slice(0, 10)}`, { x: PAGE.margin, y, size: 12, font, color: MUTED }); y -= 18;
  cover.drawText(`${items.length} item${items.length === 1 ? "" : "s"}`, { x: PAGE.margin, y, size: 12, font, color: MUTED });

  // ---- Summary
  const summary = newPage(ctx);
  summary.drawText("Summary", { x: PAGE.margin, y: PAGE.h - 70, size: 20, font: bold, color: INK });
  const totalReach = items.reduce((n, i) => n + (i.reach ?? 0), 0);
  const totalAve = items.reduce((n, i) => n + (i.ave ?? 0), 0);
  const pickups = items.reduce((n, i) => n + (i.pickups ?? 0), 0);
  const bySent = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 } as Record<string, number>;
  const byType: Record<string, number> = {};
  for (const i of items) { bySent[i.sentiment] = (bySent[i.sentiment] ?? 0) + 1; byType[i.type] = (byType[i.type] ?? 0) + 1; }
  const tiles: [string, string][] = [["Items", String(items.length)], ["Total reach", num(totalReach)], ["Total AVE", money(totalAve)], ["Pickups", String(pickups)]];
  const tileW = (PAGE.w - 2 * PAGE.margin - 3 * 10) / 4;
  tiles.forEach(([label, value], i) => {
    const x = PAGE.margin + i * (tileW + 10);
    summary.drawRectangle({ x, y: PAGE.h - 150, width: tileW, height: 56, color: SOFT });
    summary.drawText(label, { x: x + 10, y: PAGE.h - 112, size: 9, font, color: MUTED });
    summary.drawText(truncate(bold, value, 16, tileW - 20), { x: x + 10, y: PAGE.h - 136, size: 16, font: bold, color: INK });
  });
  let sy = PAGE.h - 190;
  summary.drawText("Sentiment", { x: PAGE.margin, y: sy, size: 12, font: bold, color: INK }); sy -= 18;
  for (const k of ["POSITIVE", "NEUTRAL", "NEGATIVE"]) {
    const n = bySent[k] ?? 0;
    const w = items.length ? (n / items.length) * 240 : 0;
    summary.drawText(title(k), { x: PAGE.margin, y: sy, size: 10, font, color: INK });
    summary.drawRectangle({ x: PAGE.margin + 80, y: sy - 2, width: 240, height: 10, color: LINE });
    if (w > 0) summary.drawRectangle({ x: PAGE.margin + 80, y: sy - 2, width: w, height: 10, color: SENT[k] });
    summary.drawText(`${n}${items.length ? ` (${Math.round((n / items.length) * 100)}%)` : ""}`, { x: PAGE.margin + 330, y: sy, size: 10, font, color: MUTED });
    sy -= 16;
  }
  sy -= 10;
  summary.drawText("By type", { x: PAGE.margin, y: sy, size: 12, font: bold, color: INK }); sy -= 18;
  const types = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  if (!types.length) { summary.drawText("No coverage in this period.", { x: PAGE.margin, y: sy, size: 10, font, color: MUTED }); sy -= 16; }
  const maxType = Math.max(1, ...types.map(([, n]) => n));
  for (const [k, n] of types) {
    summary.drawText(title(k), { x: PAGE.margin, y: sy, size: 10, font, color: INK });
    summary.drawRectangle({ x: PAGE.margin + 80, y: sy - 2, width: (n / maxType) * 240, height: 10, color: ACCENT });
    summary.drawText(String(n), { x: PAGE.margin + 330, y: sy, size: 10, font, color: MUTED });
    sy -= 16;
  }

  // ---- Items table
  const cols = [
    { label: "Date", w: 62, get: (i: CoverageReportItem) => fmtDate(i.date) },
    { label: "Outlet", w: 100, get: (i: CoverageReportItem) => i.outlet },
    { label: "Headline", w: 196, get: (i: CoverageReportItem) => i.headline },
    { label: "Type", w: 58, get: (i: CoverageReportItem) => title(i.type) },
    { label: "Sentiment", w: 54, get: (i: CoverageReportItem) => title(i.sentiment) },
    { label: "Reach", w: 46, get: (i: CoverageReportItem) => num(i.reach), right: true },
  ];
  const rowH = 18;
  let page: PDFPage | null = null;
  let ty = 0;
  const header = (p: PDFPage, top: number) => {
    let x = PAGE.margin;
    p.drawRectangle({ x: PAGE.margin, y: top - 4, width: PAGE.w - 2 * PAGE.margin, height: rowH, color: SOFT });
    for (const c of cols) { p.drawText(c.label, { x: x + 4, y: top + 1, size: 8, font: bold, color: MUTED }); x += c.w; }
    return top - rowH;
  };
  const startTablePage = (first: boolean) => {
    const p = newPage(ctx);
    let top = PAGE.h - 70;
    p.drawText(first ? "Coverage items" : "Coverage items (continued)", { x: PAGE.margin, y: top, size: 16, font: bold, color: INK });
    top -= 30;
    page = p;
    ty = header(p, top);
  };
  startTablePage(true);
  if (!items.length) (page as unknown as PDFPage).drawText("No coverage in this period.", { x: PAGE.margin + 4, y: ty - 2, size: 10, font, color: MUTED });
  for (const item of items) {
    if (ty < 60) startTablePage(false);
    const p = page as unknown as PDFPage;
    let x = PAGE.margin;
    for (const c of cols) {
      const text = truncate(c.right ? font : font, c.get(item) ?? "", 8.5, c.w - 8);
      const tx = c.right ? x + c.w - 4 - font.widthOfTextAtSize(text, 8.5) : x + 4;
      p.drawText(text, { x: tx, y: ty, size: 8.5, font, color: c.label === "Sentiment" ? SENT[item.sentiment] ?? INK : INK });
      x += c.w;
    }
    p.drawLine({ start: { x: PAGE.margin, y: ty - 5 }, end: { x: PAGE.w - PAGE.margin, y: ty - 5 }, thickness: 0.4, color: LINE });
    ty -= rowH;
  }

  // ---- Links
  const links = items.filter((i) => i.url);
  let lp = newPage(ctx);
  let ly = PAGE.h - 70;
  lp.drawText("Links", { x: PAGE.margin, y: ly, size: 16, font: bold, color: INK }); ly -= 28;
  if (!links.length) lp.drawText("No links recorded.", { x: PAGE.margin, y: ly, size: 10, font, color: MUTED });
  for (const i of links) {
    if (ly < 70) { lp = newPage(ctx); ly = PAGE.h - 70; }
    const head = truncate(bold, `${i.outlet}: ${i.headline}`, 9, PAGE.w - 2 * PAGE.margin);
    lp.drawText(head, { x: PAGE.margin, y: ly, size: 9, font: bold, color: INK }); ly -= 12;
    const url = truncate(font, i.url ?? "", 8, PAGE.w - 2 * PAGE.margin);
    lp.drawText(url, { x: PAGE.margin, y: ly, size: 8, font, color: ACCENT }); ly -= 16;
  }

  footers(ctx);
  return doc.save();
}
