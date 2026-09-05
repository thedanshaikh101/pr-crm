// Theme helpers for the public newsroom: fonts and colours.

export const NEWSROOM_FONTS = ["Inter", "Georgia", "Merriweather", "Source Sans 3", "Roboto", "System"] as const;
const GOOGLE = new Set(["Inter", "Merriweather", "Source Sans 3", "Roboto"]);

export function googleFontHref(family: string) {
  if (!GOOGLE.has(family)) return null;
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;600;700&display=swap`;
}

export function fontStack(family: string) {
  if (family === "Georgia") return "Georgia, 'Times New Roman', serif";
  if (family === "Merriweather") return "Merriweather, Georgia, serif";
  if (GOOGLE.has(family)) return `'${family}', ui-sans-serif, system-ui, sans-serif`;
  return "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
}

export function safeColor(c: string | null | undefined, fallback = "#1F5FBF") {
  return /^#[0-9a-f]{3,8}$/i.test(c ?? "") ? (c as string) : fallback;
}

export const SOCIAL_KEYS = ["website", "x", "linkedin", "facebook", "instagram", "youtube"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

export function normalizeSocials(raw: unknown): Partial<Record<SocialKey, string>> {
  const out: Partial<Record<SocialKey, string>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of SOCIAL_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) out[k] = v.trim();
  }
  return out;
}
