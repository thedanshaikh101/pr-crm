import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { cleanHtml } from "@/lib/html";
import { addConversationNote, attachAsset, createActivity, deleteConversation, deleteConversationNote, detachAsset, saveReply, setConversationStatus, toggleActivity, updateConversation } from "@/server/responseDesk";
import { assetOptions, attachmentsFor, nameOf, pickList, teammates, topicOptions } from "@/lib/responseDesk/data";
import { ACTIVITY_KINDS, CONVERSATION_STATUSES, channelIcon, humanize, kindIcon, truncate } from "@/lib/responseDesk/labels";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ConversationForm } from "@/components/responseDesk/ConversationForm";
import { ConfirmButton } from "@/components/responseDesk/ConfirmButton";
import { Card, Deadline, ErrorNote, Row, StatusPill, fmt } from "@/components/responseDesk/ui";

export default async function ConversationPage({ params, searchParams }: { params: { id: string }; searchParams: { edit?: string; error?: string } }) {
  const v = await requireViewer();
  const a = v.account.id;
  const c = await db.conversation.findFirst({ where: { id: params.id, accountId: a }, include: { contact: { include: { organization: { select: { id: true, name: true } } } }, topic: { select: { id: true, name: true } }, notes: { orderBy: { createdAt: "asc" } } } });
  if (!c) notFound();
  const [team, caseTypes, topics, activities, attachments, assets] = await Promise.all([
    teammates(a), pickList(a, "case_type"), topicOptions(a),
    db.activity.findMany({ where: { accountId: a, entity: "conversation", entityId: c.id }, orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }] }),
    attachmentsFor(a, "conversation", c.id), assetOptions(a),
  ]);
  const noteAuthors = await db.user.findMany({ where: { id: { in: Array.from(new Set(c.notes.map((n: any) => n.authorId as string))) } }, select: { id: true, name: true } });
  const who = nameOf([...team, ...noteAuthors.map((u: any) => ({ id: u.id, name: u.name }))]);
  const now = new Date();
  const here = `/response-desk/conversations/${c.id}`;
  const contactName = c.contact ? `${c.contact.firstName} ${c.contact.lastName}`.trim() : null;
  const headline = c.outletName ?? contactName ?? "Conversation";
  const isAdmin = v.role === "ADMIN" || v.role === "OWNER";

  if (searchParams.edit) return (
    <div>
      <div className="mb-3 flex items-center gap-2"><Link href={here} className="btn">← Back</Link><h1 className="text-xl font-semibold">Edit conversation</h1></div>
      <ConversationForm action={async (fd: FormData) => { "use server"; fd.set("redirectTo", "detail"); await updateConversation(c.id, fd); }} c={c} contact={c.contact ? { id: c.contact.id, name: contactName ?? "", outlet: c.contact.organization?.name ?? null, email: c.contact.email } : null} caseTypes={caseTypes} team={team} topics={topics} submitLabel="Save changes" />
    </div>
  );

  const stepIndex = CONVERSATION_STATUSES.indexOf(c.status as any);
  const nextStatus = CONVERSATION_STATUSES[stepIndex + 1];
  const prevStatus = CONVERSATION_STATUSES[stepIndex - 1];

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Link href="/response-desk/conversations" className="btn">← Conversations</Link>
        <details className="relative ml-auto"><summary className="btn cursor-pointer list-none">⋯</summary>
          <div className="absolute right-0 z-20 mt-1 w-60 rounded-md border border-line bg-white py-1 text-sm shadow-lg">
            <Link className="block px-3 py-1.5 hover:bg-neutral-50" href={`${here}?edit=1`}>Edit</Link>
            <Link className="block px-3 py-1.5 hover:bg-neutral-50" href={`/coverage/new?${c.contact ? `contactId=${c.contact.id}&` : ""}headline=${encodeURIComponent(truncate(c.question, 120))}`}>Log as coverage</Link>
            <Link className="block px-3 py-1.5 hover:bg-neutral-50" href={`/response-desk/statements/new?${c.topicId ? `topicId=${c.topicId}&` : ""}title=${encodeURIComponent(`Response: ${truncate(c.question, 60)}`)}`}>Create statement</Link>
            <Link className="block px-3 py-1.5 hover:bg-neutral-50" href={`/response-desk/interviews/new?${c.contact ? `contactId=${c.contact.id}&` : ""}outlet=${encodeURIComponent(c.outletName ?? "")}&conversationId=${c.id}`}>Create interview request</Link>
            <form action={deleteConversation.bind(null, c.id)}><ConfirmButton message="Delete this conversation and its notes?" className="block w-full px-3 py-1.5 text-left text-bad hover:bg-red-50">Delete</ConfirmButton></form>
          </div>
        </details>
      </div>
      <ErrorNote message={searchParams.error} />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <header className="card p-5">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold">{headline}</h1>
                {c.contact ? (
                  <p className="text-sm text-neutral-600"><Link href={`/contacts/${c.contact.id}`} className="font-medium hover:underline">{contactName}</Link>{c.contact.jobTitle ? `, ${c.contact.jobTitle}` : ""}{c.contact.organization && c.contact.organization.name !== c.outletName ? ` · ${c.contact.organization.name}` : ""}
                    {c.contact.email && <> · <a href={`mailto:${c.contact.email}`} className="hover:underline">{c.contact.email}</a></>}{(c.contact.mobile || c.contact.landline) && <> · {c.contact.mobile ?? c.contact.landline}</>}</p>
                ) : <p className="text-sm text-neutral-500">No contact linked. <Link href={`${here}?edit=1`} className="underline">Link one</Link>.</p>}
                <p className="mt-1 text-xs text-neutral-500"><span aria-hidden>{channelIcon(c.channel)}</span> {humanize(c.channel)} · received {fmt(c.receivedAt)}{c.caseType ? ` · ${c.caseType}` : ""}{c.sourceMessageId ? " · from shared inbox" : ""}</p>
              </div>
              <div className="text-right text-sm"><p className="text-xs text-neutral-500">Deadline</p><Deadline deadline={c.deadline} status={c.status} now={now} /></div>
            </div>
            <ol className="mt-4 flex flex-wrap items-center gap-1 text-xs" aria-label="Status">
              {CONVERSATION_STATUSES.map((s, i) => (
                <li key={s} className="flex items-center gap-1">
                  <span className={`rounded-full px-2.5 py-1 ${i === stepIndex ? "bg-accent text-white" : i < stepIndex ? "bg-accentSoft text-accent" : "bg-neutral-100 text-neutral-500"}`}>{humanize(s)}</span>
                  {i < CONVERSATION_STATUSES.length - 1 && <span className="text-neutral-300" aria-hidden>→</span>}
                </li>
              ))}
              <li className="ml-auto flex gap-1">
                {prevStatus && <form action={async () => { "use server"; await setConversationStatus(c.id, prevStatus); }}><button className="btn">{c.status === "CLOSED" ? "Reopen" : `Back to ${humanize(prevStatus)}`}</button></form>}
                {nextStatus && <form action={async () => { "use server"; await setConversationStatus(c.id, nextStatus); }}><button className="btn btn-primary">{nextStatus === "IN_PROGRESS" ? "Start working" : nextStatus === "RESPONDED" ? "Mark responded" : "Close"}</button></form>}
              </li>
            </ol>
          </header>

          <Card title="Question"><p className="whitespace-pre-wrap text-sm">{c.question}</p></Card>

          <Card title="Reply sent" right={c.repliedAt ? <span className="text-xs text-neutral-500">First replied {fmt(c.repliedAt)}</span> : undefined}>
            <form action={saveReply.bind(null, c.id)}>
              <RichTextEditor name="replySent" compact minHeight={120} defaultValue={c.replySent ?? ""} placeholder="Paste or write what was sent back. Saving moves the conversation to Responded." />
              <button className="btn mt-2">Save reply</button>
            </form>
          </Card>

          <Card title={`Notes (${c.notes.length})`}>
            <ul className="mb-3 space-y-2 text-sm">
              {c.notes.map((n: any) => {
                const system = n.body.startsWith("[status] ");
                return (
                  <li key={n.id} className={`flex gap-2 rounded p-2 ${system ? "bg-accentSoft/40 text-xs text-neutral-600" : "bg-neutral-50"}`}>
                    <div className="min-w-0 flex-1">
                      {system ? <p><span className="pill mr-1 bg-white text-accent">status</span>{n.body.slice(9)}</p> : <p className="whitespace-pre-wrap">{n.body}</p>}
                      <p className="mt-1 text-xs text-neutral-500">{who(n.authorId) ?? "Unknown"} · {fmt(n.createdAt)}</p>
                    </div>
                    {(n.authorId === v.user.id || isAdmin) && <form action={async () => { "use server"; await deleteConversationNote(n.id); }}><button className="text-xs text-neutral-400 hover:text-bad" aria-label="Delete note">✕</button></form>}
                  </li>
                );
              })}
              {!c.notes.length && <li className="text-neutral-500">No notes yet.</li>}
            </ul>
            <form action={addConversationNote.bind(null, c.id)}>
              <textarea name="body" className="input" rows={2} placeholder="Add a note for the team" required aria-label="Note" />
              <button className="btn mt-1">Add note</button>
            </form>
          </Card>

          <Card title={`Activities (${activities.length})`}>
            <form action={createActivity} className="mb-3 grid gap-2 sm:grid-cols-[1fr_8rem_10rem_11rem_auto]">
              <input type="hidden" name="entity" value="conversation" /><input type="hidden" name="entityId" value={c.id} />
              <input name="title" className="input" placeholder="Add a task" required aria-label="Task title" />
              <select name="kind" className="input" aria-label="Kind">{ACTIVITY_KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</select>
              <select name="assigneeId" className="input" aria-label="Assignee" defaultValue={c.assigneeId ?? v.user.id}>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
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
            <Row k="Status" val={<StatusPill status={c.status} />} />
            <Row k="Case type" val={c.caseType} />
            <Row k="Channel" val={humanize(c.channel)} />
            <Row k="Topic" val={c.topic ? <Link href={`/response-desk/topics/${c.topic.id}`} className="underline">{c.topic.name}</Link> : null} />
            <Row k="Received" val={fmt(c.receivedAt)} />
            <Row k="Replied" val={fmt(c.repliedAt)} />
            <form action={updateConversation.bind(null, c.id)} className="mt-2">
              <label className="label" htmlFor="assignee">Assignee</label>
              <div className="flex gap-1"><select id="assignee" name="assigneeId" className="input" defaultValue={c.assigneeId ?? ""}><option value="">Unassigned</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><button className="btn">Save</button></div>
            </form>
            <form action={updateConversation.bind(null, c.id)} className="mt-2">
              <label className="label" htmlFor="topicId">Topic</label>
              <div className="flex gap-1"><select id="topicId" name="topicId" className="input" defaultValue={c.topicId ?? ""}><option value="">No topic</option>{topics.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select><button className="btn">Save</button></div>
            </form>
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
              <input type="hidden" name="entity" value="conversation" /><input type="hidden" name="entityId" value={c.id} />
              <select name="assetId" className="input" required defaultValue="" aria-label="Asset from library"><option value="" disabled>{assets.length ? "Attach from library" : "Library is empty"}</option>{assets.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              <button className="btn" disabled={!assets.length}>Attach</button>
            </form>
          </Card>

          <Card title="Next steps">
            <div className="flex flex-col gap-1 text-sm">
              <Link className="btn justify-center" href={`/coverage/new?${c.contact ? `contactId=${c.contact.id}&` : ""}headline=${encodeURIComponent(truncate(c.question, 120))}`}>Log as coverage</Link>
              <Link className="btn justify-center" href={`/response-desk/statements/new?${c.topicId ? `topicId=${c.topicId}&` : ""}title=${encodeURIComponent(`Response: ${truncate(c.question, 60)}`)}`}>Create statement</Link>
              <Link className="btn justify-center" href={`/response-desk/interviews/new?${c.contact ? `contactId=${c.contact.id}&` : ""}outlet=${encodeURIComponent(c.outletName ?? "")}&conversationId=${c.id}`}>Create interview request</Link>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
