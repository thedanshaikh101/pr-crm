import { describe, expect, it } from "vitest";
import { autoMap, findDuplicate, normalizeRow, parseText } from "@/lib/contacts/import";

describe("import: header auto-detect", () => {
  it("maps Canadian Press / Onclusive export headers", () => {
    const m = autoMap(["Name", "Organization", "Job Title", "Twitter bio", "Subjects", "Twitter followers", "Classification", "Audience location", "Domain authority", "Email Address", "Landline", "Mobile", "Significant update"]);
    expect(m).toMatchObject({ Name: "fullName", Organization: "outlet", "Job Title": "jobTitle", "Twitter bio": "xBio", Subjects: "subjects", "Twitter followers": "xFollowers", Classification: "classification", "Audience location": "audienceLocation", "Domain authority": "domainAuthority", "Email Address": "email", Landline: "landline", Mobile: "mobile", "Significant update": "skip" });
  });
});

describe("import: normalize", () => {
  const mapping = autoMap(["Name", "Organization", "Email Address", "Subjects"]);
  it("splits full name and lowercases email", () => {
    const n = normalizeRow({ Name: "Jane Q. Doe", Organization: "CBC Toronto", "Email Address": "Jane.Doe@CBC.ca", Subjects: "Health > Mental Health; Sport > Hockey" }, mapping);
    expect(n.firstName).toBe("Jane"); expect(n.lastName).toBe("Q. Doe"); expect(n.email).toBe("jane.doe@cbc.ca"); expect(n.subjects).toEqual(["Health > Mental Health", "Sport > Hockey"]);
  });
  it("flags invalid emails and empty rows", () => {
    expect(normalizeRow({ Name: "X", Organization: "", "Email Address": "not-an-email", Subjects: "" }, mapping).error).toMatch(/Invalid email/);
    expect(normalizeRow({ Name: "", Organization: "", "Email Address": "", Subjects: "" }, mapping).error).toMatch(/No name/);
  });
});

describe("import: dedupe", () => {
  const existing = [{ id: "1", email: "jane@cbc.ca", firstName: "Jane", lastName: "Doe", outlet: "CBC Toronto" }, { id: "2", email: null, firstName: "Bob", lastName: "Lee", outlet: "CTV" }];
  const mk = (o: Partial<ReturnType<typeof normalizeRow>>) => ({ firstName: "", lastName: "", email: null, outlet: null, jobTitle: null, landline: null, mobile: null, xBio: null, xHandle: null, xFollowers: null, subjects: [], classifications: [], audienceLocation: [], physicalLocation: null, language: null, domainAuthority: null, socials: {}, tags: [], notes: null, ...o });
  it("matches by email first, case-insensitively", () => { expect(findDuplicate(mk({ email: "jane@cbc.ca", firstName: "Janet", lastName: "Dough" }), existing)?.id).toBe("1"); });
  it("falls back to name + outlet", () => { expect(findDuplicate(mk({ firstName: "bob", lastName: "LEE", outlet: "ctv" }), existing)?.id).toBe("2"); });
  it("does not match name without outlet", () => { expect(findDuplicate(mk({ firstName: "Bob", lastName: "Lee" }), existing)).toBeNull(); });
});

describe("import: paste parsing", () => {
  it("detects tab-delimited pastes", () => {
    const { headers, rows } = parseText("Name\tOutlet\tEmail\nJane Doe\tCBC\tjane@cbc.ca\n");
    expect(headers).toEqual(["Name", "Outlet", "Email"]); expect(rows[0].Email).toBe("jane@cbc.ca");
  });
});
