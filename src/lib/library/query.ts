// URL state for the library screen. Pure; accountId is pinned first in the where clause.
import type { Prisma } from "@prisma/client";
import { isKind } from "./kinds";

export type LibraryFilters = { view: "grid" | "table"; kind: string; tag: string; q: string; folder: string; sort: "newest" | "oldest" | "name" | "size"; deleted: boolean; page: number; per: number; asset: string };

export function parseLibraryParams(sp: Record<string, string | string[] | undefined>): LibraryFilters {
  const s = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const sort = s("sort");
  return {
    view: s("view") === "table" ? "table" : "grid",
    kind: isKind(s("kind")) ? s("kind") : "",
    tag: s("tag").trim().toLowerCase(),
    q: s("q").trim(),
    folder: s("folder") || "all",
    sort: (["newest", "oldest", "name", "size"] as const).includes(sort as any) ? (sort as LibraryFilters["sort"]) : "newest",
    deleted: s("deleted") === "1",
    page: Math.max(1, Number(s("page")) || 1),
    per: 60,
    asset: s("asset"),
  };
}

export function libraryQuery(f: Partial<LibraryFilters>, patch: Partial<LibraryFilters> = {}) {
  const m = { ...f, ...patch };
  const sp = new URLSearchParams();
  if (m.view && m.view !== "grid") sp.set("view", m.view);
  if (m.kind) sp.set("kind", m.kind);
  if (m.tag) sp.set("tag", m.tag);
  if (m.q) sp.set("q", m.q);
  if (m.folder && m.folder !== "all") sp.set("folder", m.folder);
  if (m.sort && m.sort !== "newest") sp.set("sort", m.sort);
  if (m.deleted) sp.set("deleted", "1");
  if (m.page && m.page > 1) sp.set("page", String(m.page));
  if (m.asset) sp.set("asset", m.asset);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function buildAssetWhere(f: LibraryFilters, accountId: string): { AND: Prisma.AssetWhereInput[] } {
  const and: Prisma.AssetWhereInput[] = [{ accountId, deletedAt: f.deleted ? { not: null } : null }];
  if (f.kind) and.push({ kind: f.kind });
  if (f.tag) and.push({ tags: { has: f.tag } });
  if (f.q) and.push({ OR: [{ name: { contains: f.q, mode: "insensitive" } }, { tags: { has: f.q.toLowerCase() } }] });
  if (f.folder === "unfiled") and.push({ folderId: null });
  else if (f.folder && f.folder !== "all") and.push({ folderId: f.folder });
  return { AND: and };
}

export function assetOrder(sort: LibraryFilters["sort"]): Prisma.AssetOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest": return [{ createdAt: "asc" }];
    case "name": return [{ name: "asc" }];
    case "size": return [{ size: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
    default: return [{ createdAt: "desc" }];
  }
}

export type FolderNode = { id: string; name: string; parentId: string | null; children: FolderNode[]; count: number };

/** Nest flat Folder rows; counts include only the folder's own files. */
export function buildFolderTree(rows: { id: string; name: string; parentId: string | null }[], counts: Record<string, number> = {}): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  for (const r of rows) nodes.set(r.id, { id: r.id, name: r.name, parentId: r.parentId, children: [], count: counts[r.id] ?? 0 });
  const roots: FolderNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : null;
    if (parent && parent !== n) parent.children.push(n); else roots.push(n);
  }
  const sortRec = (list: FolderNode[]) => { list.sort((a, b) => a.name.localeCompare(b.name)); list.forEach((c) => sortRec(c.children)); };
  sortRec(roots);
  return roots;
}
