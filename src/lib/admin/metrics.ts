// Pure helpers for the super-admin screens. No DB access so they unit-test cleanly.
import { PLANS } from "@/lib/plans";

/** Monthly recurring revenue contribution of one account. Annual plans are spread over 12 months. */
export function mrrFor(plan: string, interval: string | null | undefined): number {
  if (plan === "TRIAL" || plan === "ENTERPRISE") return 0;
  const p = PLANS[plan];
  if (!p) return 0;
  if (interval === "year") return Math.round((p.priceAnnual / 12) * 100) / 100;
  return p.priceMonthly;
}

export type RateInput = { delivered: number; bounced: number; complained: number };
export type Rates = { bounceRate: number; complaintRate: number; highBounce: boolean; highComplaint: boolean; base: number };

export const BOUNCE_THRESHOLD = 0.02;
export const COMPLAINT_THRESHOLD = 0.001;

/** Bounce and complaint rates over delivered + bounced. Flags when above the platform thresholds. */
export function rates({ delivered, bounced, complained }: RateInput): Rates {
  const base = Math.max(0, delivered) + Math.max(0, bounced);
  const bounceRate = base ? bounced / base : 0;
  const complaintRate = base ? complained / base : 0;
  return { bounceRate, complaintRate, base, highBounce: bounceRate > BOUNCE_THRESHOLD, highComplaint: complaintRate > COMPLAINT_THRESHOLD };
}

export function pct(n: number, digits = 2) {
  return `${(n * 100).toFixed(digits)}%`;
}

export type AccountStatus = { label: string; tone: "good" | "warn" | "bad" | "neutral"; daysLeft: number | null };

export function accountStatus(a: { plan: string; suspendedAt: Date | null; trialEndsAt: Date | null }, now = new Date()): AccountStatus {
  if (a.suspendedAt) return { label: "suspended", tone: "bad", daysLeft: null };
  if (a.plan === "TRIAL") {
    const daysLeft = a.trialEndsAt ? Math.max(0, Math.ceil((a.trialEndsAt.getTime() - now.getTime()) / 864e5)) : null;
    if (daysLeft === 0) return { label: "trial ended", tone: "bad", daysLeft };
    return { label: daysLeft === null ? "trial" : `trial, ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`, tone: "warn", daysLeft };
  }
  return { label: "active", tone: "good", daysLeft: null };
}

export const ADMIN_SORTS = ["created", "name", "mrr", "contacts", "emails", "bounce"] as const;
export type AdminSort = (typeof ADMIN_SORTS)[number];

export function parseAdminSort(s: string | undefined): AdminSort {
  return (ADMIN_SORTS as readonly string[]).includes(s ?? "") ? (s as AdminSort) : "created";
}

export type AdminRow = { name: string; createdAt: Date; mrr: number; contacts: number; emails: number; bounceRate: number };

/** Sort accounts for the admin table. Numeric sorts run descending; name ascending; created newest first. */
export function sortAccounts<T extends AdminRow>(rows: T[], sort: AdminSort): T[] {
  const out = [...rows];
  switch (sort) {
    case "name": return out.sort((a, b) => a.name.localeCompare(b.name));
    case "mrr": return out.sort((a, b) => b.mrr - a.mrr || a.name.localeCompare(b.name));
    case "contacts": return out.sort((a, b) => b.contacts - a.contacts || a.name.localeCompare(b.name));
    case "emails": return out.sort((a, b) => b.emails - a.emails || a.name.localeCompare(b.name));
    case "bounce": return out.sort((a, b) => b.bounceRate - a.bounceRate || a.name.localeCompare(b.name));
    default: return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

export const KNOWN_FLAGS = ["newsletters", "api", "webhooks", "customDomain", "aiAssist", "betaCharts"] as const;

/** Merge checkbox flags with a free-form JSON blob of extras. Throws on invalid JSON. */
export function mergeFeatureFlags(checked: string[], extraJson: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of KNOWN_FLAGS) out[f] = checked.includes(f);
  const raw = extraJson.trim();
  if (raw) {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Extra flags must be a JSON object");
    for (const [k, v] of Object.entries(parsed)) if (!(KNOWN_FLAGS as readonly string[]).includes(k)) out[k] = v;
  }
  return out;
}

/** The extras (non-known keys) of a flags object, for the textarea. */
export function extraFlags(flags: Record<string, unknown> | null | undefined) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flags ?? {})) if (!(KNOWN_FLAGS as readonly string[]).includes(k)) out[k] = v;
  return Object.keys(out).length ? JSON.stringify(out, null, 2) : "";
}
