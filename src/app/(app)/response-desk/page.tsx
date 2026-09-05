import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { teammates, nameOf } from "@/lib/responseDesk/data";
import { statementEffectiveStatus } from "@/lib/responseDesk/statements";
import { humanize, truncate, kindIcon, entityHref } from "@/lib/responseDesk/labels";
import { Card, Deadline, StatusPill, ThemeChip, fmt } from "@/components/responseDesk/ui";

function weekBounds(now: Date) {
  const day = (now.getDay() + 6) % 7; // Monday = 0
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - day);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  return { start, end };
}

export default async function AtAGlancePage() {
  const v = await requireViewer();
  const a = v.account.id;
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  const in7 = new Date(now.getTime() + 7 * 864e5);
  const { start: weekStart, end: weekEnd } = weekBounds(now);
  const openStatus = { in: ["NEW", "IN_PROGRESS"] as any };

  const [openCount, dueToday, overdue, awaiting, interviewsWeek, inReview, myOpen, byDeadline, interviews, myActivities, approved, topics, team] = await Promise.all([
    db.conversation.count({ where: { accountId: a, status: openStatus } }),
    db.conversation.count({ where: { accountId: a, status: openStatus, deadline: { gte: dayStart, lt: dayEnd } } }),
    db.conversation.count({ where: { accountId: a, status: { notIn: ["RESPONDED", "CLOSED"] }, deadline: { lt: now } } }),
    db.conversation.count({ where: { accountId: a, status: "IN_PROGRESS" } }),
    db.interviewRequest.count({ where: { accountId: a, status: "CONFIRMED", confirmedAt: { gte: weekStart, lt: weekEnd } } }),
    db.statement.count({ where: { accountId: a, status: "IN_REVIEW" } }),
    db.activity.count({ where: { accountId: a, assigneeId: v.user.id, completedAt: null } }),
    db.conversation.findMany({ where: { accountId: a, status: openStatus }, orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { receivedAt: "desc" }], take: 10, include: { contact: { select: { firstName: true, lastName: true } }, topic: { select: { name: true } } } }),
    db.interviewRequest.findMany({ where: { accountId: a, status: "CONFIRMED", confirmedAt: { gte: now, lt: in7 } }, orderBy: { confirmedAt: "asc" }, take: 10 }),
    db.activity.findMany({ where: { accountId: a, assigneeId: v.user.id, completedAt: null, OR: [{ dueAt: { lt: in7 } }, { dueAt: null }] }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }], take: 10 }),
    db.statement.findMany({ where: { accountId: a, status: "APPROVED" }, orderBy: { approvedAt: "desc" }, take: 5, include: { topic: { select: { name: true } } } }),
    db.topic.findMany({ where: { accountId: a, status: { in: ["OPEN", "MONITORING"] } }, orderBy: { updatedAt: "desc" }, take: 8, include: { theme: true, _count: { select: { conversations: true, statements: true } } } }),
    teammates(a),
  ]);
  const who = nameOf(team);

  const tiles: { label: string; n: number; href: string; tone?: "bad" | "warn" }[] = [
    { label: "Open conversations", n: openCount, href: "/response-desk/conversations?open=1" },
    { label: "Due today", n: dueToday, href: "/response-desk/conversations?open=1", tone: dueToday ? "warn" : undefined },
    { label: "Overdue", n: overdue, href: "/response-desk/conversations?overdue=1", tone: overdue ? "bad" : undefined },
    { label: "Awaiting response", n: awaiting, href: "/response-desk/conversations?status=IN_PROGRESS" },
    { label: "Interviews this week", n: interviewsWeek, href: "/response-desk/interviews" },
    { label: "Statements in review", n: inReview, href: "/response-desk/statements?status=IN_REVIEW" },
    { label: "My open activities", n: myOpen, href: "/response-desk/activities?mine=1&state=open" },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Response Desk</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/response-desk/conversations/new" className="btn btn-primary">Log conversation</Link>
          <Link href="/response-desk/interviews/new" className="btn">Interview request</Link>
          <Link href="/response-desk/statements/new" className="btn">Statement</Link>
          <Link href="/response-desk/topics/new" className="btn">Topic</Link>
          <Link href="/response-desk/activities?new=1" className="btn">Activity</Link>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="card p-3 hover:bg-neutral-50">
            <p className="text-xs text-neutral-600">{t.label}</p>
            <p className={`text-2xl font-semibold ${t.tone === "bad" ? "text-bad" : t.tone === "warn" ? "text-warn" : ""}`}>{t.n}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Card title="Conversations by deadline" right={<Link href="/response-desk/conversations" className="text-xs underline">All conversations</Link>}>
            {byDeadline.length ? (
              <div className="overflow-x-auto"><table className="data"><thead><tr><th>Deadline</th><th>Outlet</th><th>Question</th><th>Status</th><th>Assignee</th></tr></thead>
                <tbody>{byDeadline.map((c: any) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap"><Deadline deadline={c.deadline} status={c.status} now={now} /></td>
                    <td>{c.outletName ?? (c.contact ? `${c.contact.firstName} ${c.contact.lastName}` : "Unknown")}</td>
                    <td><Link href={`/response-desk/conversations/${c.id}`} className="hover:underline">{truncate(c.question, 80)}</Link>{c.topic && <span className="ml-1 text-xs text-neutral-500">· {c.topic.name}</span>}</td>
                    <td><StatusPill status={c.status} /></td>
                    <td className="text-xs">{who(c.assigneeId) ?? <span className="text-neutral-400">Unassigned</span>}</td>
                  </tr>
                ))}</tbody></table></div>
            ) : <p className="text-sm text-neutral-500">No open conversations. <Link href="/response-desk/conversations/new" className="underline">Log one</Link> when a journalist gets in touch.</p>}
          </Card>

          <Card title="Upcoming interviews, next 7 days" right={<Link href="/response-desk/interviews" className="text-xs underline">Board</Link>}>
            {interviews.length ? <ul className="divide-y divide-line text-sm">{interviews.map((i: any) => (
              <li key={i.id} className="flex items-center gap-3 py-1.5"><span className="w-36 shrink-0 text-xs text-neutral-600">{fmt(i.confirmedAt)}</span><Link href={`/response-desk/interviews/${i.id}`} className="hover:underline">{i.spokesperson} with {i.outletName ?? "outlet"}</Link><span className="chip ml-auto">{humanize(i.format)}</span></li>
            ))}</ul> : <p className="text-sm text-neutral-500">No confirmed interviews in the next week.</p>}
          </Card>

          <Card title="Open topics" right={<Link href="/response-desk/topics" className="text-xs underline">All topics</Link>}>
            {topics.length ? <ul className="divide-y divide-line text-sm">{topics.map((t: any) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 py-1.5"><Link href={`/response-desk/topics/${t.id}`} className="font-medium hover:underline">{t.name}</Link><ThemeChip theme={t.theme} /><StatusPill status={t.status} /><span className="ml-auto text-xs text-neutral-500">{t._count.conversations} conversations · {t._count.statements} statements</span></li>
            ))}</ul> : <p className="text-sm text-neutral-500">No open topics. <Link href="/response-desk/topics/new" className="underline">Create a topic</Link> to group enquiries about one issue.</p>}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title="My activities due, next 7 days" right={<Link href="/response-desk/activities?mine=1" className="text-xs underline">All</Link>}>
            {myActivities.length ? <ul className="space-y-1 text-sm">{myActivities.map((x: any) => {
              const href = entityHref(x.entity, x.entityId);
              const late = x.dueAt && x.dueAt < now;
              return <li key={x.id} className="rounded border border-line p-2"><span className="mr-1" aria-hidden>{kindIcon(x.kind)}</span>{x.title}<p className={`text-xs ${late ? "text-bad" : "text-neutral-500"}`}>{x.dueAt ? (late ? "Overdue, was due " : "Due ") + fmt(x.dueAt) : "No due date"}{href && <> · <Link href={href} className="underline">{x.entity}</Link></>}</p></li>;
            })}</ul> : <p className="text-sm text-neutral-500">Nothing on your plate this week.</p>}
          </Card>
          <Card title="Recently approved statements" right={<Link href="/response-desk/statements" className="text-xs underline">All</Link>}>
            {approved.length ? <ul className="space-y-1 text-sm">{approved.map((s: any) => (
              <li key={s.id}><Link href={`/response-desk/statements/${s.id}`} className="hover:underline">{s.title}</Link><p className="text-xs text-neutral-500"><StatusPill status={statementEffectiveStatus(s, now)} /> {who(s.approvedById) ?? ""} · {fmt(s.approvedAt, "date")}{s.topic && ` · ${s.topic.name}`}</p></li>
            ))}</ul> : <p className="text-sm text-neutral-500">No approved statements yet.</p>}
          </Card>
        </aside>
      </div>
    </div>
  );
}
