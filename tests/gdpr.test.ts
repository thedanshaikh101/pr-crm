import { describe, expect, it } from "vitest";
import { hashQuery, planPurge, redactedEmail, scrubText } from "@/lib/gdpr/purge";
import type { GdprMatches } from "@/lib/gdpr/search";
import { createHash } from "crypto";

const g = (table: string, rows: Record<string, unknown>[]) => ({ table, count: rows.length, samples: rows.slice(0, 5), rows });
const matches: GdprMatches = {
  q: "jane.doe@example.com", total: 8,
  groups: [
    g("Contact", [{ id: "c1", email: "jane.doe@example.com" }, { id: "c2", email: "JANE.DOE@example.com" }]),
    g("DistributionRecipient", [{ id: "r1", email: "Jane.Doe@example.com", name: "Jane Doe" }]),
    g("Suppression", [{ id: "s1" }]),
    g("Conversation", [{ id: "cv1" }]),
    g("InterviewRequest", []),
    g("Note", [{ id: "n1", body: "Spoke to jane.doe@example.com" }]),
    g("Coverage", [{ id: "cov1" }]),
    g("AuditLog", [{ id: "a1" }, { id: "a2" }]),
    g("Invitation", [{ id: "i1" }]),
  ],
};

describe("planPurge", () => {
  it("nulls contact references before hard-deleting contacts", () => {
    const p = planPurge(matches);
    const ops = p.steps.map((s) => s.op);
    const del = ops.indexOf("deleteContacts");
    expect(del).toBeGreaterThan(-1);
    const nullSteps = p.steps.filter((s) => s.op === "nullContactRefs") as any[];
    expect(nullSteps.map((s) => s.table).sort()).toEqual(["conversation", "coverage", "distributionRecipient", "interviewRequest"]);
    for (const s of nullSteps) { expect(ops.indexOf(s.op)).toBeLessThan(del); expect(s.contactIds).toEqual(["c1", "c2"]); }
  });
  it("redacts recipients deterministically, deletes suppressions and invitations, scrubs notes and audit meta", () => {
    const p = planPurge(matches);
    const redact = p.steps.find((s) => s.op === "redactRecipients") as any;
    expect(redact.rows).toEqual([{ id: "r1", email: redactedEmail("jane.doe@example.com"), name: "Redacted" }]);
    expect(redact.rows[0].email).toMatch(/^redacted-[0-9a-f]{8}@invalid$/);
    expect((p.steps.find((s) => s.op === "deleteSuppressions") as any).ids).toEqual(["s1"]);
    expect((p.steps.find((s) => s.op === "deleteInvitations") as any).ids).toEqual(["i1"]);
    const notes = p.steps.find((s) => s.op === "scrubNotes") as any;
    expect(notes.ids).toEqual(["n1"]);
    expect(notes.needle).toBe("jane.doe@example.com");
    expect((p.steps.find((s) => s.op === "scrubAuditMeta") as any).ids).toEqual(["a1", "a2"]);
    expect(p.counts).toEqual({ contacts: 2, recipients: 1, suppressions: 1, invitations: 1, notes: 1, auditLogs: 2 });
  });
  it("never touches conversations or coverage rows beyond nulling the contact link", () => {
    const ops = planPurge(matches).steps.map((s) => s.op);
    expect(ops).not.toContain("deleteConversations");
    expect(ops.filter((o) => o === "deleteContacts")).toHaveLength(1);
  });
  it("produces no steps for an empty match set and hashes the query instead of storing it", () => {
    const p = planPurge({ q: "nobody", total: 0, groups: [] });
    expect(p.steps).toEqual([]);
    expect(p.queryHash).toBe(createHash("sha256").update("nobody").digest("hex").slice(0, 16));
    expect(hashQuery("  Nobody ")).toBe(p.queryHash);
  });
  it("redaction is case-insensitive and stable", () => {
    expect(redactedEmail("A@B.com")).toBe(redactedEmail("a@b.com"));
  });
  it("scrubs text case-insensitively and escapes regex characters", () => {
    expect(scrubText("Met Jane.Doe@example.com (jane.doe@example.com) today", "jane.doe@example.com")).toBe("Met [redacted] ([redacted]) today");
    expect(scrubText("a+b", "a+b")).toBe("[redacted]");
  });
});
