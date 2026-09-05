import { describe, expect, it } from "vitest";
import { Packer } from "docx";
import { buildNeedToKnowDoc } from "@/lib/reports/needToKnow";
import { PDFDocument } from "pdf-lib";
import { buildCoveragePdf, pdfSafe } from "@/lib/reports/coveragePdf";

describe("Need to Know docx", () => {
  it("packs to a real document with all sections", async () => {
    const doc = buildNeedToKnowDoc({
      accountName: "Northstar Communications", generatedAt: new Date("2026-09-05T12:00:00Z"), since: new Date("2026-09-04T12:00:00Z"),
      emails: { delivered: 120, opened: 44, replied: 3, bounced: 2 },
      coverage: [{ outlet: "CBC News", headline: "Clinic opens", url: "https://www.cbc.ca/news/clinic", sentiment: "POSITIVE" }, { outlet: "Toronto Star", headline: "No link item", url: null }],
      conversations: [{ outlet: "CP24", question: "Can we get a spokesperson for 6pm?", deadline: new Date("2026-09-05T18:00:00Z") }],
      upcomingReleases: [{ headline: "Champions named", scheduledFor: new Date("2026-09-08T14:00:00Z"), client: "Bridgeworks", url: "http://localhost:3000/releases/x" }],
      tasks: [{ title: "Follow up with CP24", dueAt: new Date("2026-09-04T12:00:00Z"), assignee: "Dana", overdue: true }],
      teamActivity: [{ name: "Dana Reyes", count: 12 }, { name: "Sam Okafor", count: 4 }],
    });
    const buf = await Packer.toBuffer(doc);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });
  it("packs with empty data", async () => {
    const doc = buildNeedToKnowDoc({ accountName: "A", generatedAt: new Date(), since: new Date(), emails: { delivered: 0, opened: 0, replied: 0 }, coverage: [], conversations: [], upcomingReleases: [], tasks: [], teamActivity: [] });
    const buf = await Packer.toBuffer(doc);
    expect(buf.length).toBeGreaterThan(1000);
  });
});

describe("coverage PDF", () => {
  it("returns bytes for empty data", async () => {
    const bytes = await buildCoveragePdf({ title: "Acme", accountName: "Northstar", items: [] });
    expect(bytes.length).toBeGreaterThan(500);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(4);
  });
  it("flows 60 items across several pages with links", async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      date: new Date(2026, 0, 1 + i), outlet: `Outlet ${i}`, headline: `Headline number ${i} that is fairly long so it needs truncation in the table column — with a dash and “quotes”`,
      url: i % 3 ? `https://example.com/story/${i}` : null, type: ["BROADCAST", "ONLINE", "PRINT"][i % 3], sentiment: ["POSITIVE", "NEUTRAL", "NEGATIVE"][i % 3], reach: i * 1000, ave: i * 50, pickups: i % 4,
    }));
    const bytes = await buildCoveragePdf({ title: "Dr. Maya Chen", accountName: "Northstar", from: "2026-01-01", to: "2026-03-01", items });
    expect(bytes.length).toBeGreaterThan(5000);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(5);
  });
  it("sanitizes non-Latin text for Helvetica", () => {
    expect(pdfSafe("Café – “quoted” ✓ emoji 🎉")).toBe('Café - "quoted" ? emoji ??');
  });
});
