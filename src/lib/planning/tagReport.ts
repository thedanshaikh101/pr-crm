// Tag Report data. Server-side (DB); shared by the page and the CSV route.
import { db } from "@/lib/db";

export type TagRow = { id: string; name: string; color: string; group: string; contacts: number; releases: number; coverage: number; lastUsed: Date | null };

export async function tagReportRows(accountId: string): Promise<TagRow[]> {
  const tags = await db.tag.findMany({
    where: { accountId },
    include: {
      group: { select: { name: true } },
      _count: { select: { contacts: true, releases: true, coverage: true } },
      contacts: { select: { contact: { select: { updatedAt: true } } }, orderBy: { contact: { updatedAt: "desc" } }, take: 1 },
      releases: { select: { release: { select: { createdAt: true } } }, orderBy: { release: { createdAt: "desc" } }, take: 1 },
      coverage: { select: { coverage: { select: { createdAt: true } } }, orderBy: { coverage: { createdAt: "desc" } }, take: 1 },
    },
    orderBy: { name: "asc" },
  });
  return tags.map((t: any) => {
    const dates = [t.contacts[0]?.contact.updatedAt, t.releases[0]?.release.createdAt, t.coverage[0]?.coverage.createdAt].filter(Boolean) as Date[];
    return { id: t.id, name: t.name, color: t.color, group: t.group?.name ?? "Ungrouped", contacts: t._count.contacts, releases: t._count.releases, coverage: t._count.coverage, lastUsed: dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null };
  });
}

export const TAG_SORTS = ["name", "contacts", "releases", "coverage", "lastUsed"] as const;
export type TagSort = (typeof TAG_SORTS)[number];

export function sortTagRows(rows: TagRow[], sort: TagSort) {
  return [...rows].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "lastUsed") return (b.lastUsed?.getTime() ?? 0) - (a.lastUsed?.getTime() ?? 0);
    return b[sort] - a[sort] || a.name.localeCompare(b.name);
  });
}
