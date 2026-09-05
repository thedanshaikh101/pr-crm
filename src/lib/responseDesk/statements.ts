// Statement version and status helpers. Pure; tested in tests/responseDesk.test.ts.

export function nextVersion(versions: { version: number }[]) {
  return versions.reduce((m, v) => Math.max(m, v.version), 0) + 1;
}

/** APPROVED with a past expiresAt reads as EXPIRED without a write. */
export function statementEffectiveStatus(s: { status: string; expiresAt?: Date | string | null }, now: Date = new Date()) {
  if (s.status === "APPROVED" && s.expiresAt && new Date(s.expiresAt).getTime() < now.getTime()) return "EXPIRED";
  return s.status;
}

/** True when saving `nextBody` should append a new StatementVersion. */
export function bodyChanged(current: string | null | undefined, nextBody: string | null | undefined) {
  return (current ?? "").trim() !== (nextBody ?? "").trim();
}
