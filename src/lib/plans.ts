// Plan limits enforced in code. Edit here, not in the UI.
export type PlanLimits = {
  users: number;
  contacts: number;
  emailsPerMonth: number;
  newsrooms: number;
  priceMonthly: number;
  priceAnnual: number;
};

export const PLANS: Record<string, PlanLimits> = {
  TRIAL: { users: 3, contacts: 2_000, emailsPerMonth: 1_000, newsrooms: 1, priceMonthly: 0, priceAnnual: 0 },
  STARTER: { users: 3, contacts: 10_000, emailsPerMonth: 10_000, newsrooms: 1, priceMonthly: 79, priceAnnual: 790 },
  AGENCY: { users: 10, contacts: 50_000, emailsPerMonth: 50_000, newsrooms: 5, priceMonthly: 249, priceAnnual: 2_490 },
  ENTERPRISE: { users: 1_000, contacts: 1_000_000, emailsPerMonth: 1_000_000, newsrooms: 50, priceMonthly: 0, priceAnnual: 0 },
};

export const TRIAL_DAYS = 14;

export class PlanLimitError extends Error {
  constructor(public limit: keyof PlanLimits, public max: number) {
    super(`Plan limit reached: ${limit} (max ${max})`);
  }
}

export function limitsFor(plan: string): PlanLimits {
  return PLANS[plan] ?? PLANS.TRIAL;
}
