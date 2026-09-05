import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { cleanHtml } from "@/lib/html";
import { attachAsset, createActivity, deleteTopic, detachAsset, setTopicStatus, toggleActivity, updateTopic } from "@/server/responseDesk";
import { assetOptions, attachmentsFor, nameOf, pickList, teammates } from "@/lib/responseDesk/data";
import { ACTIVITY_KINDS, humanize, kindIcon, truncate } from "@/lib/responseDesk/labels";
import { statementEffectiveStatus } from "@/lib/responseDesk/statements";
import { TopicForm } from "@/components/responseDesk/TopicForm";
import { ConfirmButton } from "@/components/responseDesk/ConfirmButton";
import { Card, Deadline, ErrorNote, Row, StatusPill, ThemeChip, fmt } from "@/components/responseDesk/ui";

export default async function TopicPage({ params, searchParams }: { params: { id: string }; searchParams: { edit?: string; error?: string } }) {
  const v = await requireViewer();
  const a = v.account.id;
  const t = await db.topic.findFirst({ where: { id: params.id, accountId: a }, include: { theme: true, conversations: { orderBy: [{ deadline: { sort: "asc", nulls: "last" } }], include: { contact: { select: { firstName: true, lastName: true } } } }, statements: { orderBy: { updatedAt: "desc" } } } });
  if (!t) notFound();
  const [themes, types, team, activities, attachments, assets] = await Promise.all([
    db.theme.findMany({ where: { accountId: a }, orderBy: { name: "asc" } }), pickList(a, "topic_type"), teammates(a),
    db.activity.findMany({ where: { accountId: a, entity: "topic", entityId: t.id }, orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }] }),
    attachmentsFor(a, "topic", t.id), assetOptions(a),
  ]);
  const who = nameOf(team);
  const here = `/response-desk/topics/${t.id}`;
  const now = new Date();

  if (searchParams.edit) return (
    <div>
      <div className="mb-3 flex items-center gap-2"><Link href={here} className="btn">← Back</Link><h1 className="text-xl font-semibold">Edit topic</h1></div>
      <TopicForm action={updateTopic.bind(null, t.id)} topic={t} themes={themes} types={types} team={team} submitLabel="Save changes" />
    </div>
  );

  const canDelete = !t.conversations.length && !t.statements.length;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Link href="/response-desk/topics" className="btn">← Topics</Link>
        <h1 className="text-xl font-semibold">{t.name}</h1>
        <StatusPill status={t.status} />
        <details className="relative ml-auto"><summary className="btn cursor-pointer list-none">⋯</summary>
          <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border border-line bg-white py-1 text-sm shadow-lg">
            <Link className="block px-3 py-1.5 hover:bg-neutral-50" href={`${here}?edit=1`}>Edit</Link>
            {t.status !== "CLOSED"
              ? <form action={async () => { "use server"; await setTopicStatus(t.id, "CLOSED"); }}><button className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50">Close topic</button></form>
              : <form action={async () => { "use server"; await setTopicStatus(t.id, "OPEN"); }}><button className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50">Reopen topic</button></form>}
            {t.status !== "MONITORING" && <form action={async () => { "use server"; await setTopicStatus(t.id, "MONITORING"); }}><button className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50">Set to monitoring</button></form>}
            <Link className="block px-3 py-1.5 hover:bg-neutral-50" href={`/response-desk/statements/new?topicId=${t.id}`}>New statement</Link>
            <Link className="block px-3 py-1.5 hover:bg-neutral-50" href={`/response-desk/conversations/new?topicId=${t.id}`}>Log conversation</Link>
            {canDelete
              ? <form action={deleteTopic.bind(null, t.id)}><ConfirmButton message="Delete this topic?" className="block w-full px-3 py-1.5 text-left text-bad hover:bg-red-50">Delete</ConfirmButton></form>
              : <p className="px-3 py-1.5 text-xs text-neutral-500">Delete is available once no conversations or statements are linked.</p>}
          </div>
        </details>
      </div>
      <ErrorNote message={searchParams.error} />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card title="Description">
            {t.description ? <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: cleanHtml(t.description) }} /> : <p className="text-sm text-neutral-500">No description yet. <Link href={`${here}?edit=1`} className="underline">Add one</Link>.</p>}
          </Card>

          <Card title={`Conversations (${t.conversations.length})`} right={<Link href={`/response-desk/conversations/new?topicId=${t.id}`} className="btn">Log conversation</Link>}>
            {t.conversations.length ? <div className="overflow-x-auto"><table className="data"><thead><tr><th>Received</th><th>Outlet</th><th>Question</th><th>Status</th><th>Deadline</th><th>Assignee</th></tr></thead>
              <tbody>{t.conversations.map((c: any) => <tr key={c.id}><td className="whitespace-nowrap text-xs">{fmt(c.receivedAt)}</td><td>{c.outletName ?? (c.contact ? `${c.contact.firstName} ${c.contact.lastName}` : "")}</td><td><Link href={`/response-desk/conversations/${c.id}`} className="hover:underline">{truncate(c.question, 70)}</Link></td><td><StatusPill status={c.status} /></td><td className="whitespace-nowrap"><Deadline deadline={c.deadline} status={c.status} now={now} /></td><td className="text-xs">{who(c.assigneeId) ?? ""}</td></tr>)}</tbody></table></div>
              : <p className="text-sm text-neutral-500">No conversations linked to this topic.</p>}
          </Card>

          <Card title={`Statements (${t.statements.length})`} right={<Link href={`/response-desk/statements/new?topicId=${t.id}`} className="btn">New statement</Link>}>
            {t.statements.length ? <ul className="divide-y divide-line text-sm">{t.statements.map((s: any) => <li key={s.id} className="flex items-center gap-2 py-1.5"><Link href={`/response-desk/statements/${s.id}`} className="font-medium hover:underline">{s.title}</Link><StatusPill status={statementEffectiveStatus(s, now)} /><span className="ml-auto text-xs text-neutral-500">{fmt(s.updatedAt, "date")}</span></li>)}</ul>
              : <p className="text-sm text-neutral-500">No statements for this topic yet.</p>}
          </Card>

          <Card title={`Activities (${activities.length})`}>
            <form action={createActivity} className="mb-3 grid gap-2 sm:grid-cols-[1fr_8rem_10rem_11rem_auto]">
              <input type="hidden" name="entity" value="topic" /><input type="hidden" name="entityId" value={t.id} />
              <input name="title" className="input" placeholder="Add a task" required aria-label="Task title" />
              <select name="kind" className="input" aria-label="Kind">{ACTIVITY_KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</select>
              <select name="assigneeId" className="input" aria-label="Assignee" defaultValue={v.user.id}>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              <input type="datetime-local" name="dueAt" className="input" aria-label="Due" />
              <button className="btn">Add</button>
            </form>
            <ul className="space-y-1 text-sm">{activities.map((x: any) => (
              <li key={x.id} className={`flex items-center gap-2 rounded border border-line p-2 ${x.completedAt ? "opacity-60" : ""}`}>
                <form action={async () => { "use server"; await toggleActivity(x.id); }}><button className="btn px-2 py-0.5" aria-label={x.completedAt ? "Mark not done" : "Mark done"}>{x.completedAt ? "☑" : "☐"}</button></form>
                <span aria-hidden>{kindIcon(x.kind)}</span><span className={x.completedAt ? "line-through" : ""}>{x.title}</span>
                <span className={`ml-auto text-xs ${x.dueAt && !x.completedAt && x.dueAt < now ? "text-bad" : "text-neutral-500"}`}>{who(x.assigneeId) ?? "Unassigned"}{x.dueAt ? ` · ${fmt(x.dueAt)}` : ""}</span>
              </li>
            ))}{!activities.length && <li className="text-neutral-500">No activities yet.</li>}</ul>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title="Details" right={<Link href={`${here}?edit=1`} className="text-xs underline">Edit</Link>}>
            <Row k="Theme" val={<ThemeChip theme={t.theme} />} />
            <Row k="Type" val={t.topicType} />
            <Row k="Status" val={<StatusPill status={t.status} />} />
            <Row k="Owner" val={who(t.ownerId)} />
            <Row k="Created" val={fmt(t.createdAt, "date")} />
            <Row k="Updated" val={fmt(t.updatedAt)} />
          </Card>
          <Card title={`Attachments (${attachments.length})`}>
            <ul className="mb-2 space-y-1 text-sm">{attachments.map((x) => (
              <li key={x.id} className="flex items-center gap-2">
                {x.href ? <a href={x.href} className="min-w-0 flex-1 truncate underline" target="_blank" rel="noopener noreferrer">{x.asset.name}</a> : <span className="min-w-0 flex-1 truncate">{x.asset.name}</span>}
                <span className="chip">{x.asset.kind}</span>
                <form action={async () => { "use server"; await detachAsset(x.id); }}><button className="text-xs text-neutral-500 hover:text-bad" aria-label={`Remove ${x.asset.name}`}>✕</button></form>
              </li>
            ))}{!attachments.length && <li className="text-neutral-500">Nothing attached.</li>}</ul>
            <form action={attachAsset} className="flex gap-1">
              <input type="hidden" name="entity" value="topic" /><input type="hidden" name="entityId" value={t.id} />
              <select name="assetId" className="input" required defaultValue="" aria-label="Asset from library"><option value="" disabled>{assets.length ? "Attach from library" : "Library is empty"}</option>{assets.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              <button className="btn" disabled={!assets.length}>Attach</button>
            </form>
          </Card>
        </aside>
      </div>
    </div>
  );
}
