"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertContactCapacity, requireRole, requireViewer } from "@/lib/auth";
import { autoMap, errorsToCsv, googleSheetCsvUrl, parseText, parseUpload, type TargetField } from "@/lib/contacts/import";
import { LARGE_IMPORT_ROWS, MAX_IMPORT_ROWS, PREVIEW_ROWS, runImport, type ImportOptions } from "@/lib/contacts/importRun";
import { restorePatch, type Snapshot } from "@/lib/contacts/rollback";
import { canVerify, verifyEmail } from "@/lib/contacts/verify";
import { ingestContactFeed } from "@/lib/contacts/rssIngest";
import { enqueue } from "@/lib/queue";
import { newStorageKey, putObject } from "@/lib/storage";

// ------------------------------------------------------------ helpers

async function ensureOrganization(accountId: string, name: string | null) {
  if (!name) return null;
  const org = await db.organization.upsert({
    where: { accountId_name: { accountId, name } },
    create: { accountId, name },
    update: {},
  });
  return org.id as string;
}

async function ensureSubjects(paths: string[]) {
  const ids: string[] = [];
  for (const raw of paths) {
    const path = raw.replace(/\s*>\s*/g, " > ").trim();
    if (!path) continue;
    const parts = path.split(" > ");
    let parentId: string | null = null;
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc} > ${part}` : part;
      const s: { id: string } = await db.subject.upsert({ where: { path: acc }, create: { name: part, path: acc, parentId }, update: {} });
      parentId = s.id;
    }
    if (parentId) ids.push(parentId);
  }
  return ids;
}

function searchTextFor(c: { firstName: string; lastName: string; email?: string | null; jobTitle?: string | null; xBio?: string | null; bio?: string | null }, outlet?: string | null) {
  return [c.firstName, c.lastName, c.email, c.jobTitle, outlet, c.xBio, c.bio].filter(Boolean).join(" ");
}

// ------------------------------------------------------------ contacts

const ContactInput = z.object({
  firstName: z.string().min(1),
  lastName: z.string().default(""),
  email: z.string().email().optional().or(z.literal("")),
  jobTitle: z.string().optional(),
  outlet: z.string().optional(),
  landline: z.string().optional(),
  mobile: z.string().optional(),
  bio: z.string().optional(),
  xHandle: z.string().optional(),
  xFollowers: z.coerce.number().optional(),
  subjects: z.string().optional(), // "Health > Wellness; Sport > Hockey"
  classifications: z.string().optional(),
  physicalLocation: z.string().optional(),
  audienceLocation: z.string().optional(),
  language: z.string().optional(),
  importance: z.string().optional(),
  category: z.string().optional(),
  visibility: z.enum(["SHARED", "PRIVATE"]).optional(),
  ownerId: z.string().optional(),
  isExJournalist: z.coerce.boolean().optional(),
  rssUrl: z.string().url().optional().or(z.literal("")),
});

export async function createContact(form: FormData) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const data = ContactInput.parse(Object.fromEntries(form));
  await assertContactCapacity(v.account.id, v.account.plan);
  const organizationId = await ensureOrganization(v.account.id, data.outlet || null);
  const subjectIds = await ensureSubjects((data.subjects ?? "").split(";"));
  const c = await db.contact.create({
    data: {
      accountId: v.account.id,
      organizationId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || null,
      jobTitle: data.jobTitle || null,
      landline: data.landline || null,
      mobile: data.mobile || null,
      bio: data.bio || null,
      xHandle: data.xHandle?.replace(/^@/, "") || null,
      xFollowers: data.xFollowers ?? null,
      classifications: (data.classifications ?? "").split(";").map((s) => s.trim()).filter(Boolean),
      audienceLocation: (data.audienceLocation ?? "").split(";").map((s) => s.trim()).filter(Boolean),
      physicalLocation: data.physicalLocation || null,
      language: data.language || null,
      importance: (data.importance as any) || "NOT_RANKED",
      category: (data.category as any) || "MEDIA",
      visibility: data.visibility ?? "SHARED",
      ownerId: data.ownerId || v.user.id,
      isExJournalist: !!data.isExJournalist,
      rssUrl: data.rssUrl || null,
      searchText: searchTextFor(data, data.outlet),
      subjects: { create: subjectIds.map((subjectId) => ({ subjectId })) },
    },
  });
  await audit(v.account.id, v.user.id, "contact.create", "contact", c.id);
  redirect(`/contacts/${c.id}`);
}

export async function updateContact(id: string, form: FormData) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const data = ContactInput.partial().parse(Object.fromEntries(form));
  const existing = await db.contact.findFirst({ where: { id, accountId: v.account.id }, include: { organization: true } });
  if (!existing) throw new Error("Contact not found");
  const organizationId = data.outlet !== undefined ? await ensureOrganization(v.account.id, data.outlet || null) : existing.organizationId;
  // Significant update: outlet or title changed
  const outletChanged = data.outlet !== undefined && (existing.organization?.name ?? "") !== (data.outlet ?? "");
  const titleChanged = data.jobTitle !== undefined && (existing.jobTitle ?? "") !== (data.jobTitle ?? "");
  const significant = outletChanged || titleChanged
    ? [outletChanged ? `Outlet: ${existing.organization?.name ?? "none"} → ${data.outlet || "none"}` : null, titleChanged ? `Title: ${existing.jobTitle ?? "none"} → ${data.jobTitle || "none"}` : null].filter(Boolean).join("; ")
    : undefined;
  const patch: any = { ...data, organizationId };
  delete patch.outlet; delete patch.subjects; delete patch.classifications; delete patch.audienceLocation;
  if (data.email === "") patch.email = null;
  if (data.rssUrl === "") patch.rssUrl = null;
  if (data.classifications !== undefined) patch.classifications = data.classifications.split(";").map((s) => s.trim()).filter(Boolean);
  if (data.audienceLocation !== undefined) patch.audienceLocation = data.audienceLocation.split(";").map((s) => s.trim()).filter(Boolean);
  if (significant) { patch.significantUpdate = significant; patch.significantUpdateAt = new Date(); }
  if (data.subjects !== undefined) {
    const subjectIds = await ensureSubjects(data.subjects.split(";"));
    patch.subjects = { deleteMany: {}, create: subjectIds.map((subjectId) => ({ subjectId })) };
  }
  patch.searchText = searchTextFor({ ...existing, ...data } as any, data.outlet ?? existing.organization?.name);
  await db.contact.update({ where: { id }, data: patch });
  await audit(v.account.id, v.user.id, "contact.update", "contact", id, { fields: Object.keys(data) });
  revalidatePath(`/contacts/${id}`);
}

export async function deleteContacts(ids: string[]) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  await db.contact.updateMany({ where: { id: { in: ids }, accountId: v.account.id }, data: { deletedAt: new Date() } });
  await audit(v.account.id, v.user.id, "contact.delete", "contact", undefined, { ids });
  revalidatePath("/contacts");
}

export async function restoreContacts(ids: string[]) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  await db.contact.updateMany({ where: { id: { in: ids }, accountId: v.account.id }, data: { deletedAt: null } });
  revalidatePath("/contacts");
}

export async function mergeContacts(keepId: string, dropId: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const [keep, drop] = await Promise.all([
    db.contact.findFirst({ where: { id: keepId, accountId: v.account.id } }),
    db.contact.findFirst({ where: { id: dropId, accountId: v.account.id } }),
  ]);
  if (!keep || !drop) throw new Error("Contact not found");
  const fill: any = {};
  for (const k of ["email", "jobTitle", "landline", "mobile", "bio", "xBio", "xHandle", "xFollowers", "organizationId", "physicalLocation", "language", "authorPageUrl"]) {
    if ((keep as any)[k] == null && (drop as any)[k] != null) fill[k] = (drop as any)[k];
  }
  const dropLists = await db.listMember.findMany({ where: { contactId: dropId }, select: { listId: true } });
  await db.$transaction([
    db.contact.update({ where: { id: keepId }, data: fill }),
    db.listMember.createMany({ data: dropLists.map((l: any) => ({ listId: l.listId, contactId: keepId })), skipDuplicates: true }),
    db.listMember.deleteMany({ where: { contactId: dropId } }),
    db.note.updateMany({ where: { contactId: dropId }, data: { contactId: keepId } }),
    db.coverage.updateMany({ where: { contactId: dropId }, data: { contactId: keepId } }),
    db.distributionRecipient.updateMany({ where: { contactId: dropId }, data: { contactId: keepId } }),
    db.contact.update({ where: { id: dropId }, data: { mergedIntoId: keepId, deletedAt: new Date() } }),
  ]);
  await audit(v.account.id, v.user.id, "contact.merge", "contact", keepId, { dropId });
  redirect(`/contacts/${keepId}`);
}

export async function addNote(contactId: string, body: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const c = await db.contact.findFirst({ where: { id: contactId, accountId: v.account.id }, select: { id: true } });
  if (!c) throw new Error("Contact not found");
  await db.note.create({ data: { accountId: v.account.id, contactId, authorId: v.user.id, body } });
  revalidatePath(`/contacts/${contactId}`);
}

export async function bulkTag(ids: string[], tagName: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const tag = await db.tag.upsert({ where: { accountId_name: { accountId: v.account.id, name: tagName } }, create: { accountId: v.account.id, name: tagName }, update: {} });
  const owned = await db.contact.findMany({ where: { id: { in: ids }, accountId: v.account.id }, select: { id: true } });
  await db.contactTag.createMany({ data: owned.map((c: any) => ({ contactId: c.id, tagId: tag.id })), skipDuplicates: true });
  revalidatePath("/contacts");
}

// ------------------------------------------------------------ lists

export async function createList(form: FormData) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const name = String(form.get("name") ?? "").trim();
  if (!name) throw new Error("List needs a name");
  const isSmart = form.get("isSmart") === "on";
  const smartFilter = isSmart ? String(form.get("smartFilter") ?? "") : null;
  const l = await db.list.create({
    data: { accountId: v.account.id, name, description: String(form.get("description") ?? "") || null, isSmart, smartFilter: smartFilter ? { query: smartFilter } : undefined, ownerId: v.user.id, editedById: v.user.id, visibility: (form.get("visibility") as any) || "SHARED" },
  });
  await audit(v.account.id, v.user.id, "list.create", "list", l.id);
  redirect(`/lists/${l.id}`);
}

export async function addToList(listId: string, contactIds: string[]) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const list = await db.list.findFirst({ where: { id: listId, accountId: v.account.id } });
  if (!list) throw new Error("List not found");
  const owned = await db.contact.findMany({ where: { id: { in: contactIds }, accountId: v.account.id }, select: { id: true } });
  await db.listMember.createMany({ data: owned.map((c: any) => ({ listId, contactId: c.id })), skipDuplicates: true });
  await db.list.update({ where: { id: listId }, data: { editedById: v.user.id } });
  await audit(v.account.id, v.user.id, "list.add_members", "list", listId, { count: owned.length });
  revalidatePath(`/lists/${listId}`);
  revalidatePath("/contacts");
}

export async function removeFromList(listId: string, contactIds: string[]) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const list = await db.list.findFirst({ where: { id: listId, accountId: v.account.id } });
  if (!list) throw new Error("List not found");
  await db.listMember.deleteMany({ where: { listId, contactId: { in: contactIds } } });
  revalidatePath(`/lists/${listId}`);
}

export async function duplicateList(listId: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const list = await db.list.findFirst({ where: { id: listId, accountId: v.account.id }, include: { members: true } });
  if (!list) throw new Error("List not found");
  const copy = await db.list.create({
    data: { accountId: v.account.id, name: `${list.name} (copy)`, description: list.description, isSmart: list.isSmart, smartFilter: list.smartFilter ?? undefined, ownerId: v.user.id, editedById: v.user.id,
      members: { create: list.members.map((m: any) => ({ contactId: m.contactId })) } },
  });
  redirect(`/lists/${copy.id}`);
}

export async function mergeLists(targetId: string, sourceId: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const src = await db.list.findFirst({ where: { id: sourceId, accountId: v.account.id }, include: { members: true } });
  const tgt = await db.list.findFirst({ where: { id: targetId, accountId: v.account.id } });
  if (!src || !tgt) throw new Error("List not found");
  await db.listMember.createMany({ data: src.members.map((m: any) => ({ listId: targetId, contactId: m.contactId })), skipDuplicates: true });
  await db.list.update({ where: { id: sourceId }, data: { deletedAt: new Date() } });
  redirect(`/lists/${targetId}`);
}

export async function deleteList(listId: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  await db.list.updateMany({ where: { id: listId, accountId: v.account.id }, data: { deletedAt: new Date() } });
  redirect("/lists");
}

/** Smart group membership is computed at read time from the saved filter. */
export async function smartGroupContactIds(listId: string) {
  const v = await requireViewer();
  const list = await db.list.findFirst({ where: { id: listId, accountId: v.account.id } });
  if (!list?.isSmart) return [];
  const { parseFilters, buildContactWhere } = await import("@/lib/contacts/filters");
  const q = (list.smartFilter as any)?.query ?? "";
  const f = parseFilters(Object.fromEntries(new URLSearchParams(q)));
  const rows = await db.contact.findMany({ where: buildContactWhere(f, v.account.id, v.user.id), select: { id: true } });
  return rows.map((r: any) => r.id as string);
}

// ------------------------------------------------------------ imports

export async function stageImport(form: FormData) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const source = String(form.get("source") ?? "csv");
  let headers: string[] = [];
  let rows: Record<string, string>[] = [];
  let fileName = "pasted.txt";
  if (source === "paste") {
    ({ headers, rows } = parseText(String(form.get("text") ?? "")));
  } else if (source === "gsheet") {
    const url = googleSheetCsvUrl(String(form.get("url") ?? ""));
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not read the sheet. Make sure it is shared as 'Anyone with the link'.");
    ({ headers, rows } = parseText(await res.text()));
    fileName = "google-sheet.csv";
  } else {
    const file = form.get("file") as File | null;
    if (!file || !file.size) throw new Error("Choose a CSV or XLSX file.");
    fileName = file.name;
    ({ headers, rows } = parseUpload(file.name, Buffer.from(await file.arrayBuffer())));
  }
  if (!rows.length) throw new Error("No rows found. Check the first row contains column headers.");
  if (rows.length > MAX_IMPORT_ROWS) throw new Error("Imports are capped at 50,000 rows per file. Split the file.");
  const staged = rows.length > LARGE_IMPORT_ROWS;
  let storageKey: string | null = null;
  if (staged) {
    storageKey = await putObject(newStorageKey(v.account.id, "imports", `${fileName}.json`), Buffer.from(JSON.stringify(rows)), "application/json");
  }
  const imp = await db.import.create({
    data: {
      accountId: v.account.id, userId: v.user.id, fileName, source, status: "MAPPING", headers, rowCount: rows.length, mapping: autoMap(headers) as any,
      rawRows: (staged ? rows.slice(0, PREVIEW_ROWS) : rows) as any, storageKey, options: staged ? { staged: true } : undefined,
    },
  });
  redirect(`/contacts/imports/${imp.id}`);
}

export async function commitImport(importId: string, form: FormData) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const imp = await db.import.findFirst({ where: { id: importId, accountId: v.account.id } });
  if (!imp || imp.status !== "MAPPING") throw new Error("Import is not ready to run");
  const mapping: Record<string, TargetField> = {};
  for (const h of imp.headers as string[]) mapping[h] = (form.get(`map:${h}`) as TargetField) || "skip";
  const onDuplicate = (form.get("onDuplicate") as string) === "update" ? "update" : "skip";
  const listChoice = String(form.get("listId") ?? "");
  const newListName = String(form.get("newListName") ?? "").trim();
  const staged = !!(imp.options as any)?.staged && !!imp.storageKey;
  const options: ImportOptions = { onDuplicate, listChoice, newListName, staged };

  await db.import.update({ where: { id: importId }, data: { status: "RUNNING", mapping: mapping as any, options: options as any } });

  if (staged) {
    const jobId = await enqueue("imports", "run-import", { importId, mapping, options, userId: v.user.id, accountId: v.account.id });
    if (!jobId) {
      await db.import.update({ where: { id: importId }, data: { status: "FAILED", finishedAt: new Date(), rawRows: { errorsCsv: errorsToCsv([{ row: 0, error: "Could not queue the import. Is the worker running?" }]) } } });
      await audit(v.account.id, v.user.id, "import.enqueue_failed", "import", importId);
    } else {
      await audit(v.account.id, v.user.id, "import.queued", "import", importId, { rows: imp.rowCount, jobId });
    }
    redirect(`/contacts/imports`);
  }

  const rows = (imp.rawRows as Record<string, string>[]) ?? [];
  const r = await runImport({ db, accountId: v.account.id, userId: v.user.id, importId, rows, mapping, options });
  await audit(v.account.id, v.user.id, "import.commit", "import", importId, { created: r.created, updated: r.updated, skipped: r.skipped, errors: r.errors.length });
  redirect(`/contacts/imports`);
}

/** Rollback soft-deletes created contacts, restores updated ones from their snapshots, and removes list memberships the import added. */
export async function rollbackImport(importId: string) {
  const v = await requireViewer();
  requireRole(v, "ADMIN");
  const imp = await db.import.findFirst({ where: { id: importId, accountId: v.account.id } });
  if (!imp || imp.status !== "DONE") throw new Error("Only completed imports can be rolled back");
  const accountId = v.account.id;
  const snapshots = (Array.isArray(imp.snapshots) ? imp.snapshots : []) as Snapshot[];
  const opts = (imp.options ?? {}) as ImportOptions;

  await db.contact.updateMany({ where: { importId, accountId }, data: { deletedAt: new Date() } });

  let reverted = 0;
  for (const s of snapshots) {
    if (!s?.id) continue;
    const patch = restorePatch(s);
    const r = await db.contact.updateMany({ where: { id: s.id, accountId }, data: patch });
    if (!r.count) continue;
    reverted++;
    if (Array.isArray(s.subjectIds)) {
      await db.contactSubject.deleteMany({ where: { contactId: s.id } });
      if (s.subjectIds.length) await db.contactSubject.createMany({ data: s.subjectIds.map((subjectId) => ({ contactId: s.id, subjectId })), skipDuplicates: true });
    }
  }

  let membersRemoved = 0;
  if (opts.listId) {
    const list = await db.list.findFirst({ where: { id: opts.listId, accountId }, select: { id: true } });
    if (list) {
      const from = opts.startedAt ? new Date(opts.startedAt) : imp.createdAt;
      const to = imp.finishedAt ?? new Date();
      const r = await db.listMember.deleteMany({ where: { listId: list.id, addedAt: { gte: from, lte: to } } });
      membersRemoved = r.count;
      if (opts.listCreated) await db.list.updateMany({ where: { id: list.id, accountId }, data: { deletedAt: new Date() } });
    }
  }

  await db.import.update({ where: { id: importId }, data: { status: "ROLLED_BACK", rolledBackAt: new Date() } });
  await audit(accountId, v.user.id, "import.rollback", "import", importId, { removed: imp.createdCount, reverted, membersRemoved });
  revalidatePath("/contacts/imports");
  revalidatePath("/contacts");
}

// ------------------------------------------------------------ verification and content

/** Syntax + MX check for one contact, inline. Never downgrades bounced, complained or unsubscribed addresses. */
export async function verifyContactNow(contactId: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const c = await db.contact.findFirst({ where: { id: contactId, accountId: v.account.id, deletedAt: null }, select: { id: true, email: true, emailStatus: true } });
  if (!c) throw new Error("Contact not found");
  if (!c.email) return { status: c.emailStatus, note: "No email address to check." };
  if (!canVerify(c.emailStatus)) return { status: c.emailStatus, note: "This address has a delivery signal that verification does not override." };
  const r = await verifyEmail(c.email, { smtp: false });
  await db.contact.updateMany({ where: { id: c.id, accountId: v.account.id }, data: { emailStatus: r.verdict, emailVerifiedAt: new Date() } });
  await audit(v.account.id, v.user.id, "contact.verify", "contact", c.id, { verdict: r.verdict, mxOk: r.mxOk });
  revalidatePath(`/contacts/${c.id}`);
  return { status: r.verdict, note: r.mxOk ? "Mail servers found for the domain." : r.syntaxOk ? "No mail servers found for the domain." : "The address is not well formed." };
}

/** Fetch the contact's RSS feed now and refresh Recent Content. */
export async function refreshContent(contactId: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const c = await db.contact.findFirst({ where: { id: contactId, accountId: v.account.id, deletedAt: null }, select: { id: true, rssUrl: true } });
  if (!c) throw new Error("Contact not found");
  const r = await ingestContactFeed(db, c);
  await audit(v.account.id, v.user.id, r.ok ? "contact.rss_refresh" : "contact.rss_refresh_failed", "contact", c.id, { added: r.added, seen: r.seen, error: r.error });
  revalidatePath(`/contacts/${c.id}`);
  return r;
}

// ------------------------------------------------------------ organizations

export async function mergeOrganizations(keepId: string, dropId: string) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const [keep, drop] = await Promise.all([
    db.organization.findFirst({ where: { id: keepId, accountId: v.account.id } }),
    db.organization.findFirst({ where: { id: dropId, accountId: v.account.id } }),
  ]);
  if (!keep || !drop) throw new Error("Organization not found");
  await db.$transaction([
    db.contact.updateMany({ where: { organizationId: dropId }, data: { organizationId: keepId } }),
    db.coverage.updateMany({ where: { organizationId: dropId }, data: { organizationId: keepId } }),
    db.organization.update({ where: { id: dropId }, data: { mergedIntoId: keepId, deletedAt: new Date(), name: `${drop.name} (merged ${Date.now()})` } }),
  ]);
  redirect(`/organizations/${keepId}`);
}

export async function updateOrganization(id: string, form: FormData) {
  const v = await requireViewer();
  requireRole(v, "EDITOR");
  const org = await db.organization.findFirst({ where: { id, accountId: v.account.id } });
  if (!org) throw new Error("Organization not found");
  const s = (k: string) => (form.get(k) as string | null)?.trim() || null;
  await db.organization.update({
    where: { id },
    data: {
      website: s("website"), domain: s("website")?.replace(/^https?:\/\//, "").split("/")[0] ?? null,
      domainAuthority: s("domainAuthority") ? parseInt(s("domainAuthority")!, 10) : null,
      frequency: (s("frequency") as any) || null,
      classifications: (s("classifications") ?? "").split(";").map((x) => x.trim()).filter(Boolean),
      audienceLocation: (s("audienceLocation") ?? "").split(";").map((x) => x.trim()).filter(Boolean),
      language: s("language"), newsroomEmail: s("newsroomEmail"), newsroomPhone: s("newsroomPhone"),
    },
  });
  revalidatePath(`/organizations/${id}`);
}

// ------------------------------------------------------------ In-Article Search

export async function inArticleSearch(input: string) {
  const v = await requireViewer();
  let byline: string | null = null, outlet: string | null = null, title: string | null = null, url: string | null = null;
  if (/^https?:\/\//i.test(input.trim())) {
    url = input.trim();
    try {
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 PressdeskBot" }, signal: AbortSignal.timeout(8000) });
      const html = await res.text();
      const meta = (n: string) => html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${n}["'][^>]+content=["']([^"']+)`, "i"))?.[1] ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${n}["']`, "i"))?.[1] ?? null;
      byline = meta("author") ?? meta("article:author") ?? meta("parsely-author") ?? html.match(/"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/)?.[1] ?? null;
      outlet = meta("og:site_name") ?? new URL(url).hostname.replace(/^www\./, "");
      title = meta("og:title") ?? html.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim() ?? null;
    } catch { outlet = new URL(url).hostname.replace(/^www\./, ""); }
  } else {
    title = input.trim();
  }
  const words = (byline ?? "").split(/\s+/).filter(Boolean);
  const matches = words.length
    ? await db.contact.findMany({ where: { accountId: v.account.id, deletedAt: null, firstName: { equals: words[0], mode: "insensitive" }, lastName: { contains: words[words.length - 1], mode: "insensitive" } }, include: { organization: true }, take: 5 })
    : [];
  return { byline, outlet, title, url, matches: matches.map((m: any) => ({ id: m.id, name: `${m.firstName} ${m.lastName}`, outlet: m.organization?.name ?? null })) };
}
