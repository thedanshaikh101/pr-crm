import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { teammates, nameOf } from "@/lib/responseDesk/data";
import { TOPIC_STATUSES, humanize } from "@/lib/responseDesk/labels";
import { EmptyState, Fab, FilterSelect, StatusPill, ThemeChip, fmt } from "@/components/responseDesk/ui";

export default async function TopicsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const v = await requireViewer();
  const a = v.account.id;
  const { status, theme, owner, q } = searchParams;
  const where: any = { AND: [{ accountId: a }] };
  if (status && (TOPIC_STATUSES as readonly string[]).includes(status)) where.AND.push({ status });
  if (theme) where.AND.push({ themeId: theme === "none" ? null : theme });
  if (owner) where.AND.push({ ownerId: owner === "none" ? null : owner });
  if (q?.trim()) where.AND.push({ OR: [{ name: { contains: q.trim(), mode: "insensitive" } }, { description: { contains: q.trim(), mode: "insensitive" } }, { topicType: { contains: q.trim(), mode: "insensitive" } }] });
  const [rows, themes, team] = await Promise.all([
    db.topic.findMany({ where, orderBy: { updatedAt: "desc" }, include: { theme: true, _count: { select: { conversations: true, statements: true } } }, take: 300 }),
    db.theme.findMany({ where: { accountId: a }, orderBy: { name: "asc" } }),
    teammates(a),
  ]);
  const who = nameOf(team);
  const filtered = !!(status || theme || owner || q);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h1 className="text-xl font-semibold">Topics</h1><Link href="/response-desk/topics/new" className="btn btn-primary">New topic</Link></div>
      <form className="mb-3 flex flex-wrap items-center gap-2" method="get">
        <input name="q" defaultValue={q ?? ""} className="input min-w-[14rem] flex-1" placeholder="Search topics" aria-label="Search topics" />
        <FilterSelect name="status" value={status} all="Any status" options={TOPIC_STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
        <FilterSelect name="theme" value={theme} all="Any theme" options={[...themes.map((t: any) => ({ value: t.id, label: t.name })), { value: "none", label: "No theme" }]} />
        <FilterSelect name="owner" value={owner} all="Any owner" options={[...team.map((m) => ({ value: m.id, label: m.name })), { value: "none", label: "Unassigned" }]} />
        <button className="btn">Apply</button>
        {filtered && <Link href="/response-desk/topics" className="btn">Reset</Link>}
      </form>
      {rows.length ? (
        <div className="card overflow-x-auto"><table className="data"><thead><tr><th>Name</th><th>Theme</th><th>Type</th><th>Status</th><th>Owner</th><th className="text-right">Conversations</th><th className="text-right">Statements</th><th>Updated</th></tr></thead>
          <tbody>{rows.map((t: any) => (
            <tr key={t.id}>
              <td><Link href={`/response-desk/topics/${t.id}`} className="font-medium hover:underline">{t.name}</Link></td>
              <td><ThemeChip theme={t.theme} /></td>
              <td>{t.topicType ?? <span className="text-neutral-400">none</span>}</td>
              <td><StatusPill status={t.status} /></td>
              <td>{who(t.ownerId) ?? <span className="text-neutral-400">Unassigned</span>}</td>
              <td className="text-right">{t._count.conversations}</td>
              <td className="text-right">{t._count.statements}</td>
              <td className="whitespace-nowrap text-xs text-neutral-600">{fmt(t.updatedAt, "date")}</td>
            </tr>
          ))}</tbody></table></div>
      ) : <EmptyState title={filtered ? "No topics match these filters." : "No topics yet."} hint={filtered ? "Loosen a filter or clear the search." : "A topic groups every enquiry, statement and task about one issue."} action={filtered ? undefined : { href: "/response-desk/topics/new", label: "Create a topic" }} />}
      <Fab href="/response-desk/topics/new" label="New topic" />
    </div>
  );
}
