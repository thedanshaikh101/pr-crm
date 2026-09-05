import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { ListToolbar } from "@/components/ListToolbar";
import { activeConversationFilterCount, buildConversationWhere, conversationOrder, parseConversationFilters, toConversationQuery } from "@/lib/responseDesk/filters";
import { teammates, nameOf, topicOptions } from "@/lib/responseDesk/data";
import { CHANNELS, CONVERSATION_STATUSES, channelIcon, humanize, truncate } from "@/lib/responseDesk/labels";
import { Deadline, EmptyState, Fab, StatusPill, fmt } from "@/components/responseDesk/ui";

export default async function ConversationsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const v = await requireViewer();
  const a = v.account.id;
  const now = new Date();
  const f = parseConversationFilters(searchParams);
  const view = f.view;
  const where = buildConversationWhere(f, a, v.user.id, now);
  const [total, rows, team, topics] = await Promise.all([
    db.conversation.count({ where }),
    db.conversation.findMany({ where, orderBy: conversationOrder(f.sort), skip: (f.page - 1) * f.per, take: f.per, include: { contact: { select: { id: true, firstName: true, lastName: true } }, topic: { select: { id: true, name: true } } } }),
    teammates(a), topicOptions(a),
  ]);
  const who = nameOf(team);
  const pages = Math.max(1, Math.ceil(total / f.per));
  const hrefFor = (patch: Record<string, unknown>) => `/response-desk/conversations${toConversationQuery({ ...f, ...(patch as any) })}`;
  const filtered = activeConversationFilterCount(f) > 0 || !!f.q;
  const label = (c: any) => c.outletName ?? (c.contact ? `${c.contact.firstName} ${c.contact.lastName}`.trim() : "Unknown outlet");

  const drawer = (
    <form method="get" action="/response-desk/conversations" className="space-y-3 text-sm">
      {f.q && <input type="hidden" name="q" value={f.q} />}
      <div><label className="label" htmlFor="f-status">Status</label><select id="f-status" name="status" className="input" defaultValue={f.status ?? ""}><option value="">Any</option>{CONVERSATION_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select></div>
      <div><label className="label" htmlFor="f-assignee">Assignee</label><select id="f-assignee" name="assignee" className="input" defaultValue={f.assignee ?? ""}><option value="">Anyone</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}<option value="none">Unassigned</option></select></div>
      <div><label className="label" htmlFor="f-topic">Topic</label><select id="f-topic" name="topic" className="input" defaultValue={f.topic ?? ""}><option value="">Any</option>{topics.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="none">No topic</option></select></div>
      <div><label className="label" htmlFor="f-channel">Channel</label><select id="f-channel" name="channel" className="input" defaultValue={f.channel ?? ""}><option value="">Any</option>{CHANNELS.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select></div>
      <label className="flex items-center gap-2"><input type="checkbox" name="open" value="1" defaultChecked={f.open} /> Open only (new and in progress)</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="overdue" value="1" defaultChecked={f.overdue} /> Overdue only</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="mine" value="1" defaultChecked={f.mine} /> Assigned to me</label>
      <div><label className="label" htmlFor="f-sort">Sort</label><select id="f-sort" name="sort" className="input" defaultValue={f.sort}><option value="deadline">Deadline, soonest first</option><option value="received">Received, newest first</option><option value="updated">Recently updated</option></select></div>
      <div className="flex gap-2"><button className="btn btn-primary">Apply</button><Link href="/response-desk/conversations" className="btn">Clear</Link></div>
    </form>
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Conversations</h1>
        <Link href="/response-desk/conversations/new" className="btn btn-primary">Log conversation</Link>
      </div>
      <ListToolbar screen="conversations" q={f.q ?? ""} filterCount={activeConversationFilterCount(f)} view={view} total={total} from={total ? (f.page - 1) * f.per + 1 : 0} to={Math.min(total, f.page * f.per)} page={f.page} pages={pages} per={f.per}
        hrefFor={hrefFor} resetHref="/response-desk/conversations" currentQuery={toConversationQuery(f)} drawer={drawer} />
      <div className="mb-2 flex flex-wrap gap-1 text-xs">
        {[["", "All"], ["open=1", "Open"], ["overdue=1", "Overdue"], ["mine=1&open=1", "Mine"], ["status=RESPONDED", "Responded"], ["status=CLOSED", "Closed"]].map(([qs, l]) => <Link key={l} href={`/response-desk/conversations${qs ? "?" + qs : ""}`} className="btn px-2 py-0.5">{l}</Link>)}
      </div>

      {rows.length > 0 && view === "table" && (
        <div className="card overflow-x-auto"><table className="data"><thead><tr><th>Received</th><th>Outlet / contact</th><th>Question</th><th>Channel</th><th>Case type</th><th>Status</th><th>Assignee</th><th>Deadline</th><th>Topic</th></tr></thead>
          <tbody>{rows.map((c: any) => (
            <tr key={c.id}>
              <td className="whitespace-nowrap text-xs">{fmt(c.receivedAt)}</td>
              <td><span className="font-medium">{label(c)}</span>{c.contact && <Link href={`/contacts/${c.contact.id}`} className="block text-xs text-neutral-600 hover:underline">{c.contact.firstName} {c.contact.lastName}</Link>}</td>
              <td className="max-w-md"><Link href={`/response-desk/conversations/${c.id}`} className="hover:underline">{truncate(c.question, 110)}</Link></td>
              <td className="text-xs"><span aria-hidden>{channelIcon(c.channel)}</span> {humanize(c.channel)}</td>
              <td className="text-xs">{c.caseType ?? ""}</td>
              <td><StatusPill status={c.status} /></td>
              <td className="text-xs">{who(c.assigneeId) ?? <span className="text-neutral-400">Unassigned</span>}</td>
              <td className="whitespace-nowrap"><Deadline deadline={c.deadline} status={c.status} now={now} /></td>
              <td className="text-xs">{c.topic ? <Link href={`/response-desk/topics/${c.topic.id}`} className="hover:underline">{c.topic.name}</Link> : ""}</td>
            </tr>
          ))}</tbody></table></div>
      )}
      {rows.length > 0 && view === "cards" && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map((c: any) => (
          <Link key={c.id} href={`/response-desk/conversations/${c.id}`} className="card block p-3 hover:bg-neutral-50">
            <div className="mb-1 flex items-center gap-2"><span className="font-medium">{label(c)}</span><StatusPill status={c.status} /><span className="ml-auto text-xs text-neutral-500">{humanize(c.channel)}</span></div>
            <p className="text-sm text-neutral-700">{truncate(c.question, 140)}</p>
            <p className="mt-2 text-xs"><Deadline deadline={c.deadline} status={c.status} now={now} /> · {who(c.assigneeId) ?? "Unassigned"}</p>
          </Link>
        ))}</div>
      )}
      {!rows.length && <EmptyState title={filtered ? "No conversations match these filters." : "No conversations yet."} hint={filtered ? "Loosen a filter or clear the search." : "Log a conversation whenever a journalist asks for something, so nothing slips past its deadline."} action={filtered ? undefined : { href: "/response-desk/conversations/new", label: "Log a conversation" }} />}
      <Fab href="/response-desk/conversations/new" label="Log conversation" />
    </div>
  );
}
