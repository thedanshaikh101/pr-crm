import { describe, expect, it } from "vitest";
import { limitsFor, PLANS, PlanLimitError } from "@/lib/plans";

describe("billing limits", () => {
  it("has every plan and sane ordering", () => {
    for (const p of ["TRIAL", "STARTER", "AGENCY", "ENTERPRISE"]) expect(limitsFor(p)).toBeTruthy();
    expect(PLANS.STARTER.contacts).toBeLessThan(PLANS.AGENCY.contacts);
    expect(PLANS.STARTER.emailsPerMonth).toBeLessThan(PLANS.AGENCY.emailsPerMonth);
  });
  it("unknown plan falls back to trial limits", () => { expect(limitsFor("nope")).toEqual(PLANS.TRIAL); });
  it("limit errors name the limit", () => { const e = new PlanLimitError("contacts", 10); expect(e.message).toMatch(/contacts.*10/); });
});
