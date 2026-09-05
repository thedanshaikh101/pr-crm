import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { teammates, nameOf, topicOptions } from "@/lib/responseDesk/data";
import { statementEffectiveStatus } from "@/lib/responseDesk/statements";
import { STATEMENT_STATUSES, humanize } from "@/lib/responseDesk/labels";
import { EmptyState, Fab, FilterSelect, StatusPill, fmt } from "@/components/responseDesk/ui";

export default async function StatementsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const v = await requireViewer();
  const a = v.account.id;
  const now = new Date();
  const { status, topic, q } = searchParams;
  const where: any = { AND: [{ accountId: a }] };
  if (status === "EXPIRED") where.AND.push({ OR: [{ status: "EXPIRED" }, { status: "APPROVED", expiresAt: { lt: now } }] });
  else if (status === "APPROVED") where.AND.push({ status: "APPROVED", OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] });
  else if (status && (STATEMENT_STATUSES as readonly string[]).includes(status)) where.AND.push({ status });
  if (topic) where.AND.push({ topicId: topic === "none" ? null : topic });
  if (q?.trim()) where.AND.push({ OR: [{ title: { contains: q.trim(), mode: "insensitive" } }, { body: { contains: q.trim(), mode: "insensitive" } }] });
  const [rows, topics, team] = await Promise.all([
    db.statement.findMany({ where, orderBy: { updatedAt: "desc" }, include: { topic: { select: { id: true, name: true } }, _count: { select: { versions: true } } }, take: 300 }),
    topicOptions(a), teammates(a),
  ]);
  const who = nameOf(team);
  const filtered = !!(status || topic || q);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h1 className="text-xl font-semibold">Statements</h1><Link href="/response-desk/statements/new" className="btn btn-primary">New statement</Link></div>
      <form className="mb-3 flex flex-wrap items-center gap-2" method="get">
        <input name="q" defaultValue={q ?? ""} className="input min-w-[14rem] flex-1" placeholder="Search statements" aria-label="Search statements" />
        <FilterSelect name="status" value={status} all="Any status" options={STATEMENT_STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
        <FilterSelect name="topic" value={topic} all="Any topic" options={[...topics.map((t: any) => ({ value: t.id, label: t.name })), { value: "none", label: "No topic" }]} />
        <button className="btn">Apply</button>
        {filtered && <Link href="/response-desk/statements" className="btn">Reset</Link>}
      </form>
      {rows.length ? (
        <div className="card overflow-x-auto"><table className="data"><thead><tr><th>Title</th><th>Topic</th><th>Status</th><th>Approved</th><th>Expires</th><th className="text-right">Versions</th><th>Updated</th></tr></thead>
          <tbody>{rows.map((s: any) => (
            <tr key={s.id}>
              <td><Link href={`/response-desk/statements/${s.id}`} className="font-medium hover:underline">{s.title}</Link></td>
              <td className="text-xs">{s.topic ? <Link href={`/response-desk/topics/${s.topic.id}`} className="hover:underline">{s.topic.name}</Link> : ""}</td>
              <td><StatusPill status={statementEffectiveStatus(s, now)} /></td>
              <td className="text-xs">{s.approvedAt ? `${who(s.approvedById) ?? "Unknown"} · ${fmt(s.approvedAt, "date")}` : ""}</td>
              <td className={`text-xs ${s.expiresAt && s.expiresAt < now ? "text-bad" : ""}`}>{fmt(s.expiresAt)}</td>
              <td className="text-right">{s._count.versions}</td>
              <td className="whitespace-nowrap text-xs text-neutral-600">{fmt(s.updatedAt, "date")}</td>
            </tr>
          ))}</tbody></table></div>
      ) : <EmptyState title={filtered ? "No statements match these filters." : "No statements yet."} hint={filtered ? "Loosen a filter or clear the search." : "Keep approved wording in one place so anyone on the desk can reply consistently."} action={filtered ? undefined : { href: "/response-desk/statements/new", label: "Write a statement" }} />}
      <Fab href="/response-desk/statements/new" label="New statement" />
    </div>
  );
}
