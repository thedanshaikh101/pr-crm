// The row-processing loop of an import, free of request context so the worker can run it.
// Writes the Import row's status and counters itself and returns everything rollback needs.
import { Prisma, type PrismaClient } from "@prisma/client";
import { limitsFor, PlanLimitError } from "@/lib/plans";
import { errorsToCsv, findDuplicate, normalizeRow, type NormalizedContact, type TargetField } from "./import";
import { snapshotFor, type Snapshot } from "./rollback";

export const LARGE_IMPORT_ROWS = 5000;
export const MAX_IMPORT_ROWS = 50_000;
export const PREVIEW_ROWS = 50;

export type ImportOptions = {
  onDuplicate: "update" | "skip";
  listChoice?: string;
  newListName?: string;
  /** Resolved list id once the run starts; stored so rollback can remove the memberships. */
  listId?: string | null;
  listCreated?: boolean;
  staged?: boolean;
  startedAt?: string;
};

export type RunImportArgs = {
  db: PrismaClient;
  accountId: string;
  userId: string;
  importId: string;
  rows: Record<string, string>[];
  mapping: Record<string, TargetField>;
  options: ImportOptions;
};

export type RunImportResult = {
  created: number; updated: number; skipped: number;
  errors: { row: number; error: string }[];
  snapshots: Snapshot[];
  listId: string | null;
};

async function ensureOrganization(db: PrismaClient, accountId: string, name: string | null) {
  if (!name) return null;
  const org = await db.organization.upsert({ where: { accountId_name: { accountId, name } }, create: { accountId, name }, update: {} });
  return org.id as string;
}

async function ensureSubjects(db: PrismaClient, paths: string[]) {
  const ids: string[] = [];
  for (const raw of paths) {
    const path = raw.replace(/\s*>\s*/g, " > ").trim();
    if (!path) continue;
    let parentId: string | null = null;
    let acc = "";
    for (const part of path.split(" > ")) {
      acc = acc ? `${acc} > ${part}` : part;
      const s: { id: string } = await db.subject.upsert({ where: { path: acc }, create: { name: part, path: acc, parentId }, update: {} });
      parentId = s.id;
    }
    if (parentId) ids.push(parentId);
  }
  return ids;
}

function searchTextFor(n: NormalizedContact) {
  return [n.firstName, n.lastName, n.email, n.jobTitle, n.outlet, n.xBio].filter(Boolean).join(" ");
}

export async function runImport({ db, accountId, userId, importId, rows, mapping, options }: RunImportArgs): Promise<RunImportResult> {
  const startedAt = new Date();
  const onDuplicate = options.onDuplicate === "update" ? "update" : "skip";
  try {
    const normalized = rows.map((r) => normalizeRow(r, mapping));
    const account = await db.account.findUnique({ where: { id: accountId }, select: { plan: true } });
    const max = limitsFor(account?.plan ?? "TRIAL").contacts;
    const have = await db.contact.count({ where: { accountId, deletedAt: null } });
    const newCount = normalized.filter((n) => !n.error).length;
    if (have + newCount > max) throw new PlanLimitError("contacts", max);

    const existing = await db.contact.findMany({ where: { accountId, deletedAt: null }, select: { id: true, email: true, firstName: true, lastName: true, organization: { select: { name: true } } } });
    const pool = existing.map((e: any) => ({ id: e.id, email: e.email, firstName: e.firstName, lastName: e.lastName, outlet: e.organization?.name ?? null }));

    let listId: string | null = options.listId ?? null;
    let listCreated = !!options.listCreated;
    if (!listId) {
      if (options.listChoice === "new" && options.newListName) {
        listId = (await db.list.create({ data: { accountId, name: options.newListName, ownerId: userId, editedById: userId } })).id;
        listCreated = true;
      } else if (options.listChoice && options.listChoice !== "new" && options.listChoice !== "none") {
        const l = await db.list.findFirst({ where: { id: options.listChoice, accountId }, select: { id: true } });
        listId = l?.id ?? null;
      }
    }
    await db.import.update({ where: { id: importId }, data: { status: "RUNNING", options: { ...options, onDuplicate, listId, listCreated, startedAt: startedAt.toISOString() } as any } });

    let created = 0, updated = 0, skipped = 0;
    const errors: { row: number; error: string }[] = [];
    const snapshots: Snapshot[] = [];
    const touched = new Set<string>();

    for (let i = 0; i < normalized.length; i++) {
      const n = normalized[i];
      if (n.error) { errors.push({ row: i + 2, error: n.error }); continue; }
      try {
        const dup = findDuplicate(n, pool);
        const organizationId = await ensureOrganization(db, accountId, n.outlet);
        if (organizationId && n.domainAuthority != null) await db.organization.update({ where: { id: organizationId }, data: { domainAuthority: n.domainAuthority } });
        const subjectIds = await ensureSubjects(db, n.subjects);
        const base = {
          organizationId, firstName: n.firstName, lastName: n.lastName, email: n.email, jobTitle: n.jobTitle, landline: n.landline, mobile: n.mobile,
          xBio: n.xBio, xHandle: n.xHandle, xFollowers: n.xFollowers, classifications: n.classifications, audienceLocation: n.audienceLocation,
          physicalLocation: n.physicalLocation, language: n.language, socials: n.socials, searchText: searchTextFor(n),
        };
        let id: string;
        if (dup) {
          if (onDuplicate === "skip") { skipped++; }
          else {
            const patch: any = Object.fromEntries(Object.entries(base).filter(([, val]) => val != null && !(Array.isArray(val) && !val.length)));
            const before = await db.contact.findFirst({ where: { id: dup.id, accountId }, include: { subjects: { select: { subjectId: true } } } });
            if (before) {
              const prevSubjects = before.subjects.map((s: any) => s.subjectId as string);
              const snap = snapshotFor(before as any, patch, subjectIds.length ? { before: prevSubjects, after: subjectIds } : undefined);
              if (snap) snapshots.push(snap);
            }
            await db.contact.update({ where: { id: dup.id }, data: { ...patch, subjects: subjectIds.length ? { deleteMany: {}, create: subjectIds.map((subjectId) => ({ subjectId })) } : undefined } });
            updated++;
          }
          id = dup.id;
        } else {
          const c = await db.contact.create({ data: { accountId, importId, ownerId: userId, ...base, subjects: { create: subjectIds.map((subjectId) => ({ subjectId })) } } });
          pool.push({ id: c.id, email: c.email, firstName: c.firstName, lastName: c.lastName, outlet: n.outlet });
          created++;
          id = c.id;
        }
        touched.add(id);
        for (const t of n.tags) {
          const tag = await db.tag.upsert({ where: { accountId_name: { accountId, name: t } }, create: { accountId, name: t }, update: {} });
          await db.contactTag.createMany({ data: [{ contactId: id, tagId: tag.id }], skipDuplicates: true });
        }
        if (n.notes) await db.note.create({ data: { accountId, contactId: id, authorId: userId, body: n.notes } });
      } catch (e: any) {
        errors.push({ row: i + 2, error: e?.message ?? "Unknown error" });
      }
    }
    if (listId && touched.size) {
      const ids = Array.from(touched);
      for (let i = 0; i < ids.length; i += 1000) {
        await db.listMember.createMany({ data: ids.slice(i, i + 1000).map((contactId) => ({ listId: listId!, contactId })), skipDuplicates: true });
      }
      await db.list.update({ where: { id: listId }, data: { editedById: userId } });
    }
    await db.import.update({
      where: { id: importId },
      data: {
        status: "DONE", createdCount: created, updatedCount: updated, skippedCount: skipped, errorCount: errors.length, finishedAt: new Date(),
        snapshots: snapshots as any,
        rawRows: errors.length ? { errorsCsv: errorsToCsv(errors) } : Prisma.DbNull,
        options: { ...options, onDuplicate, listId, listCreated, startedAt: startedAt.toISOString() } as any,
      },
    });
    return { created, updated, skipped, errors, snapshots, listId };
  } catch (e: any) {
    await db.import.update({ where: { id: importId }, data: { status: "FAILED", finishedAt: new Date(), rawRows: { errorsCsv: errorsToCsv([{ row: 0, error: e?.message ?? "Import failed" }]) } } }).catch(() => {});
    throw e;
  }
}
