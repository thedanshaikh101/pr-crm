// Background jobs. Run: npm run worker   (needs REDIS_URL and DATABASE_URL)
// Each module under ./jobs exports a JobModule; add it to MODULES below.
import { Worker, type Job } from "bullmq";
import { queue, redis } from "@/lib/queue";
import type { JobModule } from "./jobs/types";

const MODULES: JobModule[] = [];

async function main() {
  const connection = redis();
  const byQueue = new Map<string, JobModule[]>();
  for (const m of MODULES) byQueue.set(m.queue, [...(byQueue.get(m.queue) ?? []), m]);
  for (const [q, mods] of byQueue) {
    const processors = Object.assign({}, ...mods.map((m) => m.processors)) as Record<string, (job: Job) => Promise<unknown>>;
    const options = Object.assign({}, ...mods.map((m) => m.options ?? {}));
    new Worker(q, async (job) => {
      const fn = processors[job.name];
      if (!fn) { console.warn(`[${q}] no processor for job ${job.name}`); return; }
      return fn(job);
    }, { connection, ...options })
      .on("failed", (job, err) => console.error(`[${q}] ${job?.name} #${job?.id} failed:`, err.message))
      .on("completed", (job) => console.log(`[${q}] ${job.name} #${job.id} done`));
    for (const m of mods) for (const s of m.schedules ?? []) {
      await queue(m.queue).add(s.name, s.data ?? {}, { repeat: { pattern: s.pattern }, jobId: `${m.queue}-${s.name}` });
    }
    console.log(`[worker] ${q}: ${Object.keys(processors).join(", ") || "(no processors)"}`);
  }
  console.log("worker up");
}

main().catch((e) => { console.error(e); process.exit(1); });
