import type { Job, WorkerOptions } from "bullmq";
import type { QueueName } from "@/lib/queue";

/** One file per module under src/worker/jobs. Register it in src/worker/index.ts. */
export type JobModule = {
  queue: QueueName;
  processors: Record<string, (job: Job) => Promise<unknown>>;
  schedules?: { name: string; pattern: string; data?: Record<string, unknown> }[];
  options?: Partial<WorkerOptions>;
};
