import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { queueDepths, redis } from "@/lib/queue";
import { emailProvider } from "@/lib/email/provider";
import { AdminNav } from "@/components/admin/AdminNav";
import pkg from "../../../../../package.json";

function timed<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error("timeout")), ms); p.then((x) => { clearTimeout(t); resolve(x); }, (e) => { clearTimeout(t); reject(e); }); });
}
async function ping(fn: () => Promise<unknown>, ms = 2000): Promise<{ ms: number | null; error?: string }> {
  const t0 = Date.now();
  try { await timed(fn(), ms); return { ms: Date.now() - t0 }; } catch (e: any) { return { ms: null, error: e?.message ?? "failed" }; }
}
function uptime(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return `${d ? `${d}d ` : ""}${h}h ${m}m`;
}

export default async function AdminStatusPage() {
  const v = await requireViewer();
  if (!v.user.isSuperAdmin) notFound();
  const since = new Date(Date.now() - 864e5);
  const [dbPing, redisPing, queues, lastEvent, failingWebhooks, suspended, errors] = await Promise.all([
    ping(() => db.$queryRaw`SELECT 1`),
    ping(() => redis().ping()),
    queueDepths(),
    db.emailEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true, type: true } }),
    db.webhookDelivery.findMany({ where: { createdAt: { gte: since }, attempts: { gte: 5 }, OR: [{ status: null }, { status: { lt: 200 } }, { status: { gte: 300 } }] }, include: { endpoint: { select: { url: true, accountId: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.account.count({ where: { suspendedAt: { not: null } } }),
    db.auditLog.findMany({ where: { OR: [{ action: { contains: "error", mode: "insensitive" } }, { action: { contains: "failed", mode: "insensitive" } }] }, orderBy: { createdAt: "desc" }, take: 20, include: { account: { select: { name: true } } } }),
  ]);
  const provider = emailProvider().name;
  const Tile = ({ k, val, bad }: { k: string; val: React.ReactNode; bad?: boolean }) => <div className="card p-3"><p className="text-xs text-neutral-600">{k}</p><p className={`text-xl font-semibold ${bad ? "text-bad" : ""}`}>{val}</p></div>;
  const queueBad = Object.values(queues).some((q) => q.failed > 0 || q.waiting < 0);

  return (
    <div>
      <AdminNav current="status" />
      <h1 className="mb-3 text-xl font-semibold">System status</h1>
      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile k="Database" val={dbPing.ms === null ? "down" : `${dbPing.ms} ms`} bad={dbPing.ms === null} />
        <Tile k="Redis" val={redisPing.ms === null ? "down" : `${redisPing.ms} ms`} bad={redisPing.ms === null} />
        <Tile k="Email provider" val={provider} />
        <Tile k="Last provider event" val={lastEvent ? <span className="text-base">{lastEvent.createdAt.toLocaleString()}</span> : <span className="text-neutral-400">none</span>} />
        <Tile k="Suspended accounts" val={suspended} bad={suspended > 0} />
        <Tile k="Version · uptime" val={<span className="text-base">v{(pkg as any).version} · {uptime(process.uptime())}</span>} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Queues {queueBad && <span className="pill ml-1 bg-red-50 text-bad">attention</span>}</h2>
          <table className="data"><thead><tr><th>Queue</th><th className="text-right">Waiting</th><th className="text-right">Active</th><th className="text-right">Delayed</th><th className="text-right">Failed</th></tr></thead>
            <tbody>{Object.entries(queues).map(([name, q]) => <tr key={name}><td className="font-medium">{name}</td>{q.waiting < 0 ? <td colSpan={4} className="text-bad">unreachable</td> : <><td className="text-right">{q.waiting}</td><td className="text-right">{q.active}</td><td className="text-right">{q.delayed}</td><td className={`text-right ${q.failed ? "font-semibold text-bad" : ""}`}>{q.failed}</td></>}</tr>)}</tbody></table>
          <p className="mt-2 text-xs text-neutral-500">Redis {redisPing.error ? `error: ${redisPing.error}` : "reachable"}. Database {dbPing.error ? `error: ${dbPing.error}` : "reachable"}.</p>
        </section>
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Webhook deliveries failing (5+ attempts, last 24h): {failingWebhooks.length}</h2>
          <ul className="divide-y divide-line text-sm">{failingWebhooks.map((w: any) => <li key={w.id} className="py-1.5"><code className="text-xs">{w.event}</code> → <span className="break-all">{w.endpoint.url}</span> <span className="text-xs text-neutral-500">status {w.status ?? "none"} · {w.attempts} attempts · {w.createdAt.toLocaleString()}</span></li>)}</ul>
          {!failingWebhooks.length && <p className="text-sm text-neutral-500">No webhook endpoints are failing.</p>}
        </section>
        <section className="card p-4 lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold">Recent errors and failures (audit log)</h2>
          <table className="data"><thead><tr><th>When</th><th>Account</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>{errors.map((l: any) => <tr key={l.id}><td className="whitespace-nowrap">{l.createdAt.toLocaleString()}</td><td>{l.account.name}</td><td><code className="text-xs">{l.action}</code></td><td className="text-xs">{l.entity} {l.entityId}</td><td className="text-xs text-neutral-600">{l.meta ? JSON.stringify(l.meta).slice(0, 160) : ""}</td></tr>)}</tbody></table>
          {!errors.length && <p className="p-2 text-sm text-neutral-500">Nothing logged with "error" or "failed" in the action name.</p>}
        </section>
      </div>
    </div>
  );
}
