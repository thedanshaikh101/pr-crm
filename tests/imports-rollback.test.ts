import { describe, expect, it } from "vitest";
import { restorePatch, rollbackSummary, snapshotFor } from "@/lib/contacts/rollback";

const existing = { id: "c1", firstName: "Jane", lastName: "Doe", email: "jane@cbc.ca", jobTitle: "Reporter", organizationId: "o1", classifications: ["Television"], socials: { website: "https://a" }, xFollowers: 100, mobile: null };

describe("import rollback: snapshotFor", () => {
  it("captures only fields that actually change", () => {
    const s = snapshotFor(existing, { firstName: "Jane", jobTitle: "Senior Reporter", mobile: "555-0100", classifications: ["Television"], xFollowers: 250 });
    expect(s).not.toBeNull();
    expect(s!.id).toBe("c1");
    expect(s!.fields).toEqual({ jobTitle: "Reporter", mobile: null, xFollowers: 100 });
    expect(s!.subjectIds).toBeUndefined();
  });
  it("returns null when nothing changes", () => {
    expect(snapshotFor(existing, { firstName: "Jane", email: "jane@cbc.ca", socials: { website: "https://a" } })).toBeNull();
  });
  it("records previous subjects when the set is replaced", () => {
    const s = snapshotFor(existing, { firstName: "Jane" }, { before: ["s1", "s2"], after: ["s2", "s3"] });
    expect(s!.subjectIds).toEqual(["s1", "s2"]);
    expect(snapshotFor(existing, { firstName: "Jane" }, { before: ["s2", "s1"], after: ["s1", "s2"] })).toBeNull();
  });
  it("ignores keys that are not snapshot fields", () => {
    const s = snapshotFor(existing, { importId: "x", accountId: "y", jobTitle: "Host" });
    expect(Object.keys(s!.fields)).toEqual(["jobTitle"]);
  });
});

describe("import rollback: restorePatch", () => {
  it("produces the reverse update, nulls included", () => {
    const s = snapshotFor(existing, { jobTitle: "Host", mobile: "555", organizationId: "o2" })!;
    expect(restorePatch(s)).toEqual({ jobTitle: "Reporter", mobile: null, organizationId: "o1" });
  });
  it("round-trips through JSON as stored on Import.snapshots", () => {
    const s = JSON.parse(JSON.stringify(snapshotFor(existing, { classifications: ["Radio"], xFollowers: 1 })));
    expect(restorePatch(s)).toEqual({ classifications: ["Television"], xFollowers: 100 });
  });
  it("drops unknown keys from tampered snapshots", () => {
    expect(restorePatch({ id: "c1", fields: { jobTitle: "x", accountId: "evil" } as any })).toEqual({ jobTitle: "x" });
  });
  it("summarises what a rollback would do", () => {
    expect(rollbackSummary({ createdCount: 12, snapshots: [{ id: "a" }, { id: "b" }] }).label).toBe("Roll back (removes 12 created, reverts 2 updated)");
    expect(rollbackSummary({ createdCount: 0, snapshots: null }).reverts).toBe(0);
  });
});
