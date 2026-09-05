/** Minimal CSV helpers shared by the export routes. */
export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '""';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvLine(cells: unknown[]) {
  return cells.map(csvEscape).join(",");
}

export function toCsv(head: string[], rows: unknown[][]) {
  return [csvLine(head), ...rows.map(csvLine)].join("\n") + "\n";
}

export const COVERAGE_CSV_HEAD = ["Outlet", "Headline", "URL", "Date", "Type", "Focus", "Sentiment", "Client", "Release", "Reach", "AVE", "Pickups", "Tags", "Summary"];

/** One CSV line for a coverage row as loaded with client, release and tags included. */
export function coverageCsvRow(c: any) {
  return csvLine([
    c.outletName, c.headline, c.url, c.publishedAt instanceof Date ? c.publishedAt.toISOString().slice(0, 10) : c.publishedAt, c.type, c.focus, c.sentiment,
    c.client?.name, c.release?.headline, c.estimatedReach, c.adValue == null ? "" : Number(c.adValue), c.pickupCount,
    (c.tags ?? []).map((t: any) => t.tag?.name ?? t.name).join("; "), c.summary,
  ]);
}
