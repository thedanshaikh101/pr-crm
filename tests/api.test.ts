import { describe, expect, it } from "vitest";
import { buildOpenApi, listOperations, openapi, SIGNATURE_HEADER, WEBHOOK_EVENTS } from "@/lib/api/openapi";
import { ContactCreateBody, ContactPatchBody, CoverageCreateBody, ListCreateBody, MembersBody } from "@/lib/api/schemas";
import { paginate } from "@/lib/api/paginate";

const PATHS = ["/api/v1/contacts", "/api/v1/contacts/{id}", "/api/v1/lists", "/api/v1/lists/{id}/members", "/api/v1/releases", "/api/v1/releases/{id}", "/api/v1/coverage", "/api/v1/openapi.json", "/api/v1/docs"];

describe("openapi document", () => {
  it("declares every path and method", () => {
    for (const p of PATHS) expect(openapi.paths[p], p).toBeDefined();
    expect(Object.keys(openapi.paths["/api/v1/contacts/{id}"]).sort()).toEqual(["delete", "get", "patch"]);
    expect(Object.keys(openapi.paths["/api/v1/lists/{id}/members"]).sort()).toEqual(["delete", "get", "post"]);
    expect(openapi.paths["/api/v1/coverage"].post).toBeDefined();
  });
  it("has the shared components and bearer security", () => {
    for (const c of ["Contact", "List", "Release", "Coverage", "Page", "Error"]) expect(openapi.components.schemas[c], c).toBeDefined();
    expect(openapi.components.securitySchemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
    expect(openapi.paths["/api/v1/openapi.json"].get?.security).toEqual([]);
  });
  it("documents every webhook event with the signature header", () => {
    for (const e of WEBHOOK_EVENTS) expect(openapi.webhooks[e], e).toBeDefined();
    expect(SIGNATURE_HEADER).toBe("X-Pressdesk-Signature");
    expect(JSON.stringify(openapi.components.schemas.WebhookEnvelope)).toContain("sha256=");
  });
  it("serialises to JSON and fills the server URL from APP_URL", () => {
    const json = JSON.stringify(buildOpenApi("https://pr.example.com/"));
    expect(json.length).toBeGreaterThan(1000);
    expect(JSON.parse(json).servers[0].url).toBe("https://pr.example.com");
    expect(JSON.parse(json).openapi).toBe("3.0.3");
  });
  it("lists operations for the docs page", () => {
    const ops = listOperations();
    expect(ops.find((o) => o.method === "PATCH" && o.path === "/api/v1/contacts/{id}")).toBeDefined();
    expect(ops.find((o) => o.path === "/api/v1/contacts" && o.method === "GET")?.params).toEqual(expect.arrayContaining(["q", "list", "tag", "updatedSince", "page", "per"]));
    expect(ops.find((o) => o.path === "/api/v1/docs")?.auth).toBe(false);
  });
});

describe("api schemas reject bad bodies", () => {
  it("contacts", () => {
    expect(ContactCreateBody.safeParse({}).success).toBe(false);
    expect(ContactCreateBody.safeParse({ firstName: "Jo", email: "nope" }).success).toBe(false);
    expect(ContactCreateBody.safeParse({ firstName: "Jo", tags: ["a"] }).success).toBe(true);
    expect(ContactPatchBody.safeParse({}).success).toBe(false);
    expect(ContactPatchBody.safeParse({ email: null }).success).toBe(true);
    expect(ContactPatchBody.safeParse({ tags: "x" }).success).toBe(false);
  });
  it("lists and members", () => {
    expect(ListCreateBody.safeParse({ name: "" }).success).toBe(false);
    expect(MembersBody.safeParse({ contactIds: [] }).success).toBe(false);
    expect(MembersBody.safeParse({ contactIds: ["a", "b"] }).success).toBe(true);
  });
  it("coverage", () => {
    expect(CoverageCreateBody.safeParse({ outletName: "CBC", headline: "x", publishedAt: "2026-01-01", type: "TV" }).success).toBe(false);
    expect(CoverageCreateBody.safeParse({ outletName: "CBC", headline: "x", publishedAt: "not a date", type: "ONLINE" }).success).toBe(false);
    const ok = CoverageCreateBody.safeParse({ outletName: "CBC", headline: "x", publishedAt: "2026-01-01T00:00:00Z", type: "ONLINE", adValue: 12.5, url: "https://cbc.ca/a" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.publishedAt).toBeInstanceOf(Date);
    expect(CoverageCreateBody.safeParse({ outletName: "CBC", headline: "x", publishedAt: "2026-01-01", type: "ONLINE", estimatedReach: -1 }).success).toBe(false);
  });
});

describe("paginate", () => {
  it("defaults, caps at 250, and ignores junk", () => {
    expect(paginate("http://x/api?page=3&per=50")).toEqual({ page: 3, per: 50, skip: 100 });
    expect(paginate("http://x/api?per=9999")).toMatchObject({ per: 250 });
    expect(paginate("http://x/api?page=-2&per=abc")).toEqual({ page: 1, per: 100, skip: 0 });
  });
});
