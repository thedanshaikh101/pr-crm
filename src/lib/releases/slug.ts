/** Slug base from a headline. Pure; safe to import in client components. */
export function slugBase(headline: string) {
  return (headline ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 70) || "release";
}
