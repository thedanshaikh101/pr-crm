// Background jobs: imports (large), distribution sends with throttling, nightly email verification, reports.
// Run: npm run worker   (needs REDIS_URL)
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
export const queues = {
  sends: new Queue("sends", { connection }),
  verify: new Queue("verify", { connection }),
  imports: new Queue("imports", { connection }),
  reports: new Queue("reports", { connection }),
};

new Worker("sends", async (job) => {
  // Step 2 implements: load Distribution, iterate recipients, honour Suppression, merge fields, add List-Unsubscribe header,
  // rewrite links to /t/<code>, send via emailProvider(), record providerMsgId, throttle per account (rate limiter below).
  console.log("[sends] job", job.id, job.data);
}, { connection, limiter: { max: 50, duration: 1000 } });

new Worker("verify", async (job) => {
  // Step 2 implements: syntax + MX check (dns.resolveMx) for every UNVERIFIED contact, nightly via repeat job.
  console.log("[verify] job", job.id, job.data);
}, { connection, concurrency: 5 });

new Worker("imports", async (job) => { console.log("[imports] job", job.id); }, { connection });
new Worker("reports", async (job) => { console.log("[reports] job", job.id); }, { connection });

queues.verify.add("nightly", {}, { repeat: { pattern: "0 3 * * *" }, jobId: "verify-nightly" }).catch(console.error);
console.log("worker up");
