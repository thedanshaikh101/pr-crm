// Pure planning for tag merges so the DB steps are testable without Prisma.
export type TagCounts = { contacts: number; releases: number; coverage: number };

export type MergePlan = {
  fromId: string;
  intoId: string;
  /** Join tables to re-point (rows are copied with skipDuplicates, then the source rows deleted). */
  joins: { table: "contactTag" | "releaseTag" | "coverageTag"; key: "contactId" | "releaseId" | "coverageId" }[];
  /** Rows expected to move at most (duplicates on the target drop out). */
  maxMoved: number;
};

export function planTagMerge(fromId: string, intoId: string, fromCounts: TagCounts): MergePlan {
  if (fromId === intoId) throw new Error("Choose a different tag to merge into");
  return {
    fromId,
    intoId,
    joins: [
      { table: "contactTag", key: "contactId" },
      { table: "releaseTag", key: "releaseId" },
      { table: "coverageTag", key: "coverageId" },
    ],
    maxMoved: fromCounts.contacts + fromCounts.releases + fromCounts.coverage,
  };
}

export function describeCounts(c: TagCounts) {
  const parts = [c.contacts ? `${c.contacts} contact${c.contacts === 1 ? "" : "s"}` : null, c.releases ? `${c.releases} release${c.releases === 1 ? "" : "s"}` : null, c.coverage ? `${c.coverage} coverage item${c.coverage === 1 ? "" : "s"}` : null].filter(Boolean);
  return parts.length ? parts.join(", ") : "nothing";
}

export const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
export function normalizeColor(c: string | null | undefined, fallback = "#1F5FBF") {
  const s = (c ?? "").trim();
  return COLOR_RE.test(s) ? s.toUpperCase() : fallback;
}
