// Pure pagination parsing, kept free of DB/Next imports so it unit-tests cheaply.
export const MAX_PER_PAGE = 250;
export const DEFAULT_PER_PAGE = 100;

/** ?page=&per= with a hard cap of 250 per page. */
export function paginate(url: URL | string) {
  const u = typeof url === "string" ? new URL(url, "http://localhost") : url;
  const page = Math.max(1, Math.floor(Number(u.searchParams.get("page") ?? 1)) || 1);
  const per = Math.min(MAX_PER_PAGE, Math.max(1, Math.floor(Number(u.searchParams.get("per") ?? DEFAULT_PER_PAGE)) || DEFAULT_PER_PAGE));
  return { page, per, skip: (page - 1) * per };
}
