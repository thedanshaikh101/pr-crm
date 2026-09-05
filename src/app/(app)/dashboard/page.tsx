import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function Dashboard() {
  const v = await requireViewer();
  const a = v.account.id;
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0, 0, 0, 0);
  const tenDaysAgo = new Date(now.getTime() - 10 * 864e5);
  const [logsAll, todosMe, todosAll, coming, statements, weekCounts] = await Promise.all([
    db.auditLog.findMany({ where: { accountId: a, createdAt: { gte: tenDaysAgo } }, select: { createdAt: true, userId: true } }),
    db.activity.findMany({ where: { accountId: a, assigneeId: v.user.id, completedAt: null }, orderBy: { dueAt: "asc" }, take: 10 }),
    db.activity.findMany({ where: { accountId: a, completedAt: null }, orderBy: { dueAt: "asc" }, take: 10 }),
    db.release.findMany({ where: { accountId: a, status: "SCHEDULED", scheduledFor: { gte: now } }, orderBy: { scheduledFor: "asc" }, take: 5 }),
    db.statement.findMany({ where: { accountId: a, status: "APPROVED" }, orderBy: { updatedAt: "desc" }, take: 5 }),
    Promise.all([
      db.activity.count({ where: { accountId: a, createdAt: { gte: weekStart } } }),
      db.interviewRequest.count({ where: { accountId: a, createdAt: { gte: weekStart } } }),
      db.interviewRequest.count({ where: { accountId: a, status: "COMPLETED", updatedAt: { gte: weekStart } } }),
      db.topic.count({ where: { accountId: a, createdAt: { gte: weekStart } } }),
      db.conversation.count({ where: { accountId: a, createdAt: { gte: weekStart } } }),
      db.statement.count({ where: { accountId: a, createdAt: { gte: weekStart } } }),
      db.distributionRecipient.count({ where: { distribution: { accountId: a, createdAt: { gte: weekStart } } } }),
      db.distribution.count({ where: { accountId: a, createdAt: { gte: weekStart }, isTest: false } }),
    ]),
  ]);
  const days = Array.from({ length: 10 }, (_, i) => { const d = new Date(now.getTime() - (9 - i) * 864e5); return d.toISOString().slice(0, 10); });
  const totals = days.map((d) => logsAll.filter((l: any) => l.createdAt.toISOString().slice(0, 10) === d).length);
  const mine = days.map((d) => logsAll.filter((l: any) => l.userId === v.user.id && l.createdAt.toISOString().slice(0, 10) === d).length);
  const max = Math.max(1, ...totals);
  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const labels = ["Activities", "Interviews Created", "Interviews Given", "Cases", "Conversations", "Statements", "Emails", "Distributions"];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div><p className="text-xs text-neutral-500">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p><h1 className="text-xl font-semibold">{greet}, {v.user.name.split(" ")[0]}</h1></div>
        <p className="text-xs text-neutral-500">Last sign-in {v.user.lastSignInAt?.toLocaleString() ?? "—"}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Recent activity, last 10 days</h2><span className="text-xs text-neutral-500"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-accent" />Total <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-sm bg-accentSoft" />Me</span></div>
          <div className="flex h-36 items-end gap-2">{days.map((d, i) => (
            <div key={d} className="flex flex-1 flex-col items-center gap-1"><div className="flex w-full items-end justify-center gap-0.5" style={{ height: 120 }}>
              <div className="w-1/2 rounded-t bg-accent" style={{ height: `${(totals[i] / max) * 100}%` }} title={`${totals[i]} total`} />
              <div className="w-1/2 rounded-t bg-accentSoft" style={{ height: `${(mine[i] / max) * 100}%` }} title={`${mine[i]} mine`} />
            </div><span className="text-[10px] text-neutral-500">{d.slice(5)}</span></div>
          ))}</div>
        </section>
        <section className="card p-4">
          <h2 className="text-sm font-semibold">Need to Know Report</h2>
          <p className="mt-1 text-xs text-neutral-600">The last 24 hours: sends, opens, coverage logged, new conversations.</p>
          <a className="btn btn-primary mt-3" href="/api/reports/need-to-know">Download</a>
        </section>
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Total activity this week</h2>
          <dl className="grid grid-cols-2 gap-x-4 text-sm">{labels.map((l, i) => <div key={l} className="flex justify-between border-b border-line py-1"><dt className="text-neutral-600">{l}</dt><dd className="font-medium">{weekCounts[i]}</dd></div>)}</dl>
        </section>
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">To Do</h2>
          {todosMe.length ? <ul className="text-sm">{todosMe.map((t: any) => <li key={t.id} className="border-b border-line py-1">{t.title}{t.dueAt && <span className="ml-2 text-xs text-neutral-500">due {t.dueAt.toLocaleDateString()}</span>}</li>)}</ul> : <p className="text-sm text-good">Great work! No tasks pending.</p>}
          {todosAll.length > todosMe.length && <p className="mt-2 text-xs text-neutral-500">{todosAll.length - todosMe.length} more assigned to teammates.</p>}
        </section>
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Coming up</h2>
          <ul className="text-sm">
            {coming.map((r: any) => <li key={r.id} className="border-b border-line py-1"><Link href={`/releases/${r.id}`} className="hover:underline">{r.headline}</Link><span className="ml-2 text-xs text-neutral-500">{r.scheduledFor?.toLocaleString()}</span></li>)}
            {statements.map((s: any) => <li key={s.id} className="border-b border-line py-1"><span className="pill mr-1 bg-green-50 text-good">approved</span>{s.title}</li>)}
            {!coming.length && !statements.length && <li className="text-neutral-500">Nothing scheduled. <Link href="/releases" className="underline">Draft a release</Link>.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
