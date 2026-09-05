// Large imports: rows were staged in object storage by stageImport; this loads them and runs the shared loop.
import type { Job } from "bullmq";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getObject } from "@/lib/storage";
import { runImport, type ImportOptions } from "@/lib/contacts/importRun";
import { errorsToCsv, type TargetField } from "@/lib/contacts/import";
import type { JobModule } from "./types";

type RunImportJob = { importId: string; mapping?: Record<string, TargetField>; options?: ImportOptions; userId?: string; accountId?: string };

async function runStagedImport(job: Job<RunImportJob>) {
  const { importId } = job.data;
  const imp = await db.import.findUnique({ where: { id: importId } });
  if (!imp) { console.warn(`[imports] ${importId} not found`); return { skipped: true }; }
  // A retry after a FAILED/DONE run must not re-process rows (it would double-import).
  if (imp.status !== "RUNNING") { console.warn(`[imports] ${importId} is ${imp.status}; not re-running`); return { skipped: true }; }
  if (job.data.accountId && job.data.accountId !== imp.accountId) throw new Error("import/account mismatch");
  if (!imp.storageKey) throw new Error("Staged import has no storage key");
  const obj = await getObject(imp.storageKey);
  if (!obj) {
    await db.import.update({ where: { id: importId }, data: { status: "FAILED", finishedAt: new Date(), rawRows: { errorsCsv: errorsToCsv([{ row: 0, error: "Staged rows are missing from storage" }]) } } });
    throw new Error("Staged rows missing from storage");
  }
  const rows = JSON.parse(obj.body.toString("utf8")) as Record<string, string>[];
  const mapping = (job.data.mapping ?? (imp.mapping as Record<string, TargetField>)) ?? {};
  const options = (job.data.options ?? (imp.options as ImportOptions)) ?? { onDuplicate: "skip" };
  const userId = job.data.userId ?? imp.userId;
  const r = await runImport({ db, accountId: imp.accountId, userId, importId, rows, mapping, options: { ...options, staged: true } });
  await audit(imp.accountId, userId, "import.commit", "import", importId, { created: r.created, updated: r.updated, skipped: r.skipped, errors: r.errors.length, background: true });
  return { created: r.created, updated: r.updated, skipped: r.skipped, errors: r.errors.length };
}

export const importsModule: JobModule = {
  queue: "imports",
  processors: { "run-import": runStagedImport },
  options: { concurrency: 1, lockDuration: 10 * 60_000 },
};
