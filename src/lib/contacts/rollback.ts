// Pre-update snapshots for import rollback. Pure: the import loop calls snapshotFor before
// it overwrites a duplicate, and rollbackImport applies restorePatch afterwards.

export const SNAPSHOT_FIELDS = [
  "organizationId", "firstName", "lastName", "email", "jobTitle", "landline", "mobile", "xBio", "xHandle", "xFollowers",
  "classifications", "audienceLocation", "physicalLocation", "language", "socials", "searchText",
] as const;
export type SnapshotField = (typeof SNAPSHOT_FIELDS)[number];

export type Snapshot = {
  id: string;
  /** Field -> previous value, only for fields the import is about to change. */
  fields: Partial<Record<SnapshotField, unknown>>;
  /** Previous subject ids, present only when the import replaces subjects. */
  subjectIds?: string[];
};

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (typeof a === "object" && typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

/**
 * Capture the previous values of every field in `patch` that actually differs from `existing`.
 * Returns null when nothing would change (and no subject replacement is happening).
 */
export function snapshotFor(
  existing: { id: string } & Partial<Record<SnapshotField, unknown>>,
  patch: Partial<Record<string, unknown>>,
  subjects?: { before: string[]; after: string[] },
): Snapshot | null {
  const fields: Snapshot["fields"] = {};
  for (const k of SNAPSHOT_FIELDS) {
    if (!(k in patch)) continue;
    const prev = existing[k] ?? null;
    const next = patch[k] ?? null;
    if (!same(prev, next)) fields[k] = prev;
  }
  const replacingSubjects = subjects && !same([...subjects.before].sort(), [...subjects.after].sort());
  if (!Object.keys(fields).length && !replacingSubjects) return null;
  const snap: Snapshot = { id: existing.id, fields };
  if (replacingSubjects) snap.subjectIds = [...subjects!.before];
  return snap;
}

/** The Prisma update data that puts a contact back the way it was. Subjects are handled separately. */
export function restorePatch(snapshot: Snapshot): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(snapshot.fields)) {
    if (!(SNAPSHOT_FIELDS as readonly string[]).includes(k)) continue;
    out[k] = v === undefined ? null : v;
  }
  return out;
}

export function rollbackSummary(imp: { createdCount: number; snapshots: unknown }) {
  const reverts = Array.isArray(imp.snapshots) ? imp.snapshots.length : 0;
  return { removes: imp.createdCount, reverts, label: `Roll back (removes ${imp.createdCount} created, reverts ${reverts} updated)` };
}
