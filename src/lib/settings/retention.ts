// Pure helpers for the nightly housekeeping jobs.
export const RECYCLE_DAYS = 30;

export type RetentionAccount = { id: string; retentionDays: number | null };

/** Accounts with a retention policy and the cutoff date before which rows are dropped. */
export function retentionCutoffs(accounts: RetentionAccount[], now = new Date()) {
  return accounts
    .filter((a) => typeof a.retentionDays === "number" && a.retentionDays > 0)
    .map((a) => ({ accountId: a.id, retentionDays: a.retentionDays as number, cutoff: new Date(now.getTime() - (a.retentionDays as number) * 864e5) }));
}

export function recycleCutoff(now = new Date()) {
  return new Date(now.getTime() - RECYCLE_DAYS * 864e5);
}

/** Days until a soft-deleted row is purged (0 when due). */
export function daysLeft(deletedAt: Date, now = new Date()) {
  return Math.max(0, Math.ceil((deletedAt.getTime() + RECYCLE_DAYS * 864e5 - now.getTime()) / 864e5));
}

export const DELETED_TYPES = ["contacts", "organizations", "lists", "releases", "coverage", "assets"] as const;
export type DeletedType = (typeof DELETED_TYPES)[number];
export const DELETED_LABELS: Record<DeletedType, string> = { contacts: "Contacts", organizations: "Organizations", lists: "Lists", releases: "Releases", coverage: "Coverage", assets: "Assets" };
