// Pure helpers for the Resource Library. Tested in tests/library.test.ts.

export const ASSET_KINDS = ["image", "logo", "headshot", "pdf", "bio", "video_link"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const KIND_LABELS: Record<AssetKind, string> = { image: "Images", logo: "Logos", headshot: "Headshots", pdf: "PDFs", bio: "Bios", video_link: "Video links" };

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const ALLOWED_MIMES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/avif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export function isAllowedMime(mime: string) {
  return ALLOWED_MIMES.has((mime ?? "").toLowerCase().split(";")[0].trim());
}

export function isKind(k: unknown): k is AssetKind {
  return typeof k === "string" && (ASSET_KINDS as readonly string[]).includes(k);
}

/** Guess a library kind from the mime type, falling back to the file extension. */
export function kindFromMime(name: string, mime?: string | null): AssetKind {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  const ext = (name ?? "").toLowerCase().split(".").pop() ?? "";
  const lower = (name ?? "").toLowerCase();
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) {
    if (/\blogo\b|logo[-_.]|[-_.]logo/.test(lower)) return "logo";
    if (/headshot|portrait/.test(lower)) return "headshot";
    return "image";
  }
  if (m === "text/plain" || m.includes("wordprocessingml") || ["txt", "docx", "doc", "md"].includes(ext)) return "bio";
  if (m.startsWith("video/") || ["mp4", "mov", "webm"].includes(ext)) return "video_link";
  return "image";
}

export function formatBytes(n: number | null | undefined) {
  const b = Number(n ?? 0);
  if (!b || b < 0) return "0 B";
  if (b < 1024) return `${b} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = b / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export type MediaKitGroup<T> = { kind: AssetKind; label: string; assets: T[] };

/** Media kit assets grouped in display order. Empty groups are dropped. */
export function groupForMediaKit<T extends { kind: string; inMediaKit?: boolean; deletedAt?: Date | null }>(assets: T[]): MediaKitGroup<T>[] {
  const out: MediaKitGroup<T>[] = [];
  for (const kind of ASSET_KINDS) {
    const list = assets.filter((a) => a.kind === kind && a.inMediaKit !== false && !a.deletedAt);
    if (list.length) out.push({ kind, label: KIND_LABELS[kind], assets: list });
  }
  return out;
}

export function parseTags(input: string | null | undefined) {
  return Array.from(new Set((input ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 30);
}

export function isImageMime(mime?: string | null) {
  return (mime ?? "").toLowerCase().startsWith("image/");
}

export function fileIcon(kind: string, mime?: string | null) {
  if (kind === "pdf" || mime === "application/pdf") return "📄";
  if (kind === "video_link") return "🎬";
  if (kind === "bio") return "📝";
  if (kind === "logo") return "🏷";
  if (kind === "headshot") return "🙂";
  return "🖼";
}
