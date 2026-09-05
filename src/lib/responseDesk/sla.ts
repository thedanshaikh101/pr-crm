// SLA state for a conversation deadline. Pure; tested in tests/responseDesk.test.ts.

export type SlaState = "overdue" | "soon" | "ok" | "none" | "done";

const SOON_MS = 4 * 36e5; // under four hours

/** overdue: deadline passed and not answered. soon: under 4h left. done: RESPONDED or CLOSED. */
export function slaState(deadline: Date | string | null | undefined, status: string, now: Date = new Date()): SlaState {
  if (status === "RESPONDED" || status === "CLOSED") return "done";
  if (!deadline) return "none";
  const d = new Date(deadline).getTime();
  if (Number.isNaN(d)) return "none";
  const left = d - now.getTime();
  if (left < 0) return "overdue";
  if (left < SOON_MS) return "soon";
  return "ok";
}

export function slaClass(state: SlaState) {
  if (state === "overdue") return "text-bad font-medium";
  if (state === "soon") return "text-warn font-medium";
  if (state === "done") return "text-neutral-400";
  return "text-neutral-700";
}

/** Short human phrase for the time left or elapsed: "3h left", "overdue by 2d", "no deadline". */
export function slaLabel(deadline: Date | string | null | undefined, status: string, now: Date = new Date()) {
  const state = slaState(deadline, status, now);
  if (state === "none") return "no deadline";
  const d = new Date(deadline as Date).getTime();
  const diff = Math.abs(d - now.getTime());
  const span = diff < 36e5 ? `${Math.max(1, Math.round(diff / 6e4))}m` : diff < 864e5 ? `${Math.round(diff / 36e5)}h` : `${Math.round(diff / 864e5)}d`;
  if (state === "done") return d < now.getTime() ? "answered" : "answered early";
  if (state === "overdue") return `overdue by ${span}`;
  return `${span} left`;
}

export function isOpenStatus(status: string) {
  return status === "NEW" || status === "IN_PROGRESS";
}
