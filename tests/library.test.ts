import { describe, expect, it } from "vitest";
import { formatBytes, groupForMediaKit, isAllowedMime, kindFromMime, parseTags } from "@/lib/library/kinds";

describe("kindFromMime", () => {
  it("maps mime types to library kinds", () => {
    expect(kindFromMime("a.jpg", "image/jpeg")).toBe("image");
    expect(kindFromMime("brand-logo.png", "image/png")).toBe("logo");
    expect(kindFromMime("Jane_Headshot.jpg", "image/jpeg")).toBe("headshot");
    expect(kindFromMime("deck.pdf", "application/pdf")).toBe("pdf");
    expect(kindFromMime("bio.txt", "text/plain")).toBe("bio");
    expect(kindFromMime("bio.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("bio");
    expect(kindFromMime("clip.mp4", "video/mp4")).toBe("video_link");
  });
  it("falls back to the extension when the mime is missing", () => {
    expect(kindFromMime("x.PDF")).toBe("pdf");
    expect(kindFromMime("x.webp", "")).toBe("image");
    expect(kindFromMime("mystery", "application/octet-stream")).toBe("image");
  });
  it("knows which mimes may be uploaded", () => {
    expect(isAllowedMime("image/png")).toBe(true);
    expect(isAllowedMime("application/pdf")).toBe(true);
    expect(isAllowedMime("video/mp4")).toBe(false);
    expect(isAllowedMime("application/x-msdownload")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats sizes with one decimal under 10", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(null)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(15 * 1024)).toBe("15 KB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });
});

describe("groupForMediaKit", () => {
  it("groups in display order and drops empty groups and deleted or excluded assets", () => {
    const g = groupForMediaKit([
      { id: 1, kind: "pdf", inMediaKit: true }, { id: 2, kind: "logo", inMediaKit: true }, { id: 3, kind: "logo", inMediaKit: false },
      { id: 4, kind: "headshot", inMediaKit: true, deletedAt: new Date() }, { id: 5, kind: "video_link", inMediaKit: true }, { id: 6, kind: "logo", inMediaKit: true },
    ]);
    expect(g.map((x) => x.kind)).toEqual(["logo", "pdf", "video_link"]);
    expect(g[0].assets.map((a) => a.id)).toEqual([2, 6]);
    expect(g[0].label).toBe("Logos");
  });
  it("returns nothing for an empty kit", () => {
    expect(groupForMediaKit([])).toEqual([]);
  });
});

describe("parseTags", () => {
  it("splits, trims, lowercases and dedupes", () => {
    expect(parseTags(" Launch, launch ,Q3 ,,")).toEqual(["launch", "q3"]);
    expect(parseTags(null)).toEqual([]);
  });
});

describe("library query state", () => {
  it("pins accountId first and maps filters", async () => {
    const { buildAssetWhere, parseLibraryParams, libraryQuery, buildFolderTree } = await import("@/lib/library/query");
    const f = parseLibraryParams({ kind: "pdf", tag: "Launch", q: "deck", folder: "unfiled", sort: "size", view: "table", page: "2" });
    const w = buildAssetWhere(f, "acct_A");
    expect(w.AND[0]).toEqual({ accountId: "acct_A", deletedAt: null });
    expect(JSON.stringify(w)).toContain('"kind":"pdf"');
    expect(JSON.stringify(w)).toContain('"folderId":null');
    expect(f.tag).toBe("launch");
    expect(libraryQuery(f)).toBe("?view=table&kind=pdf&tag=launch&q=deck&folder=unfiled&sort=size&page=2");
    expect(libraryQuery(f, { page: 1, asset: "x" })).toContain("asset=x");
    const tree = buildFolderTree([{ id: "b", name: "B", parentId: "a" }, { id: "a", name: "A", parentId: null }, { id: "c", name: "C", parentId: "missing" }], { b: 2 });
    expect(tree.map((t) => t.id)).toEqual(["a", "c"]);
    expect(tree[0].children[0]).toMatchObject({ id: "b", count: 2 });
  });
  it("ignores unknown kinds and sorts", async () => {
    const { parseLibraryParams } = await import("@/lib/library/query");
    const f = parseLibraryParams({ kind: "exe", sort: "random" });
    expect(f.kind).toBe(""); expect(f.sort).toBe("newest"); expect(f.view).toBe("grid");
  });
});
