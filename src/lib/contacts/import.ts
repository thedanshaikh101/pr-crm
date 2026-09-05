import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

export type Row = Record<string, string>;

export const TARGET_FIELDS = [
  "firstName", "lastName", "fullName", "email", "outlet", "jobTitle", "landline", "mobile",
  "xBio", "xHandle", "xFollowers", "subjects", "classification", "audienceLocation",
  "physicalLocation", "language", "domainAuthority", "website", "linkedin", "instagram", "tags", "notes", "skip",
] as const;
export type TargetField = (typeof TARGET_FIELDS)[number];

// Header aliases learned from Onclusive / Canadian Press / Muck Rack / Cision exports.
const ALIASES: Record<TargetField, string[]> = {
  firstName: ["first name", "firstname", "first"],
  lastName: ["last name", "lastname", "surname", "last"],
  fullName: ["name", "full name", "contact", "contact name", "journalist"],
  email: ["email", "email address", "e-mail", "work email"],
  outlet: ["outlet", "organization", "organisation", "publication", "media outlet", "company", "primary outlet"],
  jobTitle: ["job title", "title", "role", "position"],
  landline: ["landline", "phone", "telephone", "office phone", "work phone"],
  mobile: ["mobile", "cell", "cell phone", "mobile number"],
  xBio: ["twitter bio", "x bio", "bio"],
  xHandle: ["twitter", "x", "twitter handle", "x handle"],
  xFollowers: ["twitter followers", "x followers", "followers"],
  subjects: ["subjects", "beats", "beat", "topics", "coverage"],
  classification: ["classification", "media type", "outlet type", "type"],
  audienceLocation: ["audience location", "market", "coverage area", "region"],
  physicalLocation: ["location", "city", "town", "physical location", "state", "province"],
  language: ["language"],
  domainAuthority: ["domain authority", "da", "authority"],
  website: ["website", "url", "author page"],
  linkedin: ["linkedin"],
  instagram: ["instagram"],
  tags: ["tags", "tag", "list"],
  notes: ["notes", "comment", "comments"],
  skip: [],
};

export function autoMap(headers: string[]): Record<string, TargetField> {
  const map: Record<string, TargetField> = {};
  const taken = new Set<TargetField>();
  for (const h of headers) {
    const norm = h.trim().toLowerCase();
    let hit: TargetField = "skip";
    for (const f of TARGET_FIELDS) {
      if (f === "skip" || taken.has(f)) continue;
      if (ALIASES[f].includes(norm)) { hit = f; break; }
    }
    if (hit === "skip") {
      for (const f of TARGET_FIELDS) {
        if (f === "skip" || taken.has(f)) continue;
        if (ALIASES[f].some((a) => norm.includes(a) && a.length > 3)) { hit = f; break; }
      }
    }
    if (hit !== "skip") taken.add(hit);
    map[h] = hit;
  }
  return map;
}

export function parseUpload(fileName: string, buf: Buffer): { headers: string[]; rows: Row[] } {
  if (/\.xlsx?$/i.test(fileName)) {
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: "", raw: false });
    return { headers: rows.length ? Object.keys(rows[0]) : [], rows };
  }
  return parseText(buf.toString("utf8"));
}

/** CSV, TSV, or a pasted block. Detects delimiter. */
export function parseText(text: string): { headers: string[]; rows: Row[] } {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const delimiter = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? "\t" : ",";
  const rows = parse(text, { columns: true, skip_empty_lines: true, bom: true, delimiter, relax_column_count: true, trim: true }) as Row[];
  return { headers: rows.length ? Object.keys(rows[0]) : [], rows };
}

export function googleSheetCsvUrl(url: string) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) throw new Error("That does not look like a Google Sheet URL.");
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}

export type NormalizedContact = {
  firstName: string;
  lastName: string;
  email: string | null;
  outlet: string | null;
  jobTitle: string | null;
  landline: string | null;
  mobile: string | null;
  xBio: string | null;
  xHandle: string | null;
  xFollowers: number | null;
  subjects: string[];
  classifications: string[];
  audienceLocation: string[];
  physicalLocation: string | null;
  language: string | null;
  domainAuthority: number | null;
  socials: Record<string, string>;
  tags: string[];
  notes: string | null;
  error?: string;
};

const splitList = (s: string) => s.split(/[;|,]/).map((x) => x.trim()).filter(Boolean);
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeRow(row: Row, mapping: Record<string, TargetField>): NormalizedContact {
  const get = (f: TargetField) => {
    const h = Object.keys(mapping).find((k) => mapping[k] === f);
    return h ? (row[h] ?? "").toString().trim() : "";
  };
  let firstName = get("firstName");
  let lastName = get("lastName");
  if (!firstName && !lastName) {
    const parts = get("fullName").split(/\s+/).filter(Boolean);
    firstName = parts[0] ?? "";
    lastName = parts.slice(1).join(" ");
  }
  const rawEmail = get("email").toLowerCase();
  const email = rawEmail && emailRe.test(rawEmail) ? rawEmail : null;
  const num = (s: string) => { const n = parseInt(s.replace(/[^0-9]/g, ""), 10); return Number.isFinite(n) ? n : null; };
  const socials: Record<string, string> = {};
  for (const k of ["website", "linkedin", "instagram"] as const) { const v = get(k); if (v) socials[k] = v; }
  const out: NormalizedContact = {
    firstName, lastName, email,
    outlet: get("outlet") || null,
    jobTitle: get("jobTitle") || null,
    landline: get("landline") || null,
    mobile: get("mobile") || null,
    xBio: get("xBio") || null,
    xHandle: get("xHandle").replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//, "").replace(/^@/, "") || null,
    xFollowers: num(get("xFollowers")),
    subjects: splitList(get("subjects")),
    classifications: splitList(get("classification")),
    audienceLocation: splitList(get("audienceLocation")),
    physicalLocation: get("physicalLocation") || null,
    language: get("language") || null,
    domainAuthority: num(get("domainAuthority")),
    socials,
    tags: splitList(get("tags")),
    notes: get("notes") || null,
  };
  if (!firstName && !lastName && !email) out.error = "No name or email";
  else if (rawEmail && !email) out.error = `Invalid email: ${rawEmail}`;
  return out;
}

export type ExistingContact = { id: string; email: string | null; firstName: string; lastName: string; outlet: string | null };

/**
 * Dedupe rule: email first, then name+outlet (case-insensitive). Returns the
 * matched existing id or null. Pure, so the tests cover it without a DB.
 */
export function findDuplicate(c: NormalizedContact, existing: ExistingContact[]): ExistingContact | null {
  if (c.email) {
    const hit = existing.find((e) => e.email && e.email.toLowerCase() === c.email);
    if (hit) return hit;
  }
  const key = `${c.firstName} ${c.lastName}`.trim().toLowerCase();
  if (!key || !c.outlet) return null;
  return existing.find((e) => `${e.firstName} ${e.lastName}`.trim().toLowerCase() === key && (e.outlet ?? "").toLowerCase() === c.outlet!.toLowerCase()) ?? null;
}

export function errorsToCsv(errors: { row: number; error: string }[]) {
  return ["row,error", ...errors.map((e) => `${e.row},"${e.error.replace(/"/g, '""')}"`)].join("\n");
}
