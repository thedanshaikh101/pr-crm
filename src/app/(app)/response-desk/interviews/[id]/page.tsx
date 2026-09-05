import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { attachAsset, cancelInterview, completeInterview, confirmInterview, declineInterview, deleteInterview, detachAsset, proposeInterview, updateInterview } from "@/server/responseDesk";
import { assetOptions, attachmentsFor } from "@/lib/responseDesk/data";
import { humanize, proposedTimesOf } from "@/lib/responseDesk/labels";
import { InterviewForm } from "@/components/responseDesk/InterviewForm";
import { ConfirmButton } from "@/components/responseDesk/ConfirmButton";
import { Card, Row, StatusPill, fmt } from "@/components/responseDesk/ui";

export default async function InterviewPage({ params, searchParams }: { params: { id: string }; searchParams: { edit?: string } }) {
  const v = await requireViewer();
  const a = v.account.id;
  const i = await db.interviewRequest.findFirst({ where: { id: params.id, accountId: a }, include: { contact: { include: { organization: { select: { name: true } } } } } });
  if (!i) notFound();
  const [event, attachments, assets] = await Promise.all([
    db.calendarEvent.findFirst({ where: { accountId: a, kind: "INTERVIEW", entityId: i.id } }),
    attachmentsFor(a, "interview", i.id), assetOptions(a),
  ]);
  const times = proposedTimesOf(i.proposedTimes);
  const here = `/response-desk/interviews/${i.id}`;
  const contact = i.contact ? { id: i.contact.id, name: `${i.contact.firstName} ${i.contact.lastName}`.trim(), outlet: i.contact.organization?.name ?? null, email: i.contact.email } : null;
  const title = `${i.spokesperson} with ${i.outletName ?? contact?.name ?? "outlet"}`;

  if (searchParams.edit) return (
    <div>
      <div className="mb-3 flex items-center gap-2"><Link href={here} className="btn">← Back</Link><h1 className="text-xl font-semibold">Edit interview request</h1></div>
      <InterviewForm action={updateInterview.bind(null, i.id)} i={i} contact={contact} times={times} submitLabel="Save changes" />
    </div>
  );

  const ended = i.status === "DECLINED" || i.status === "CANCELLED" || i.status === "COMPLETED";
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Link href="/response-desk/interviews" className="btn">← Interview requests</Link>
        <h1 className="text-xl font-semibold">{title}</h1><StatusPill status={i.status} />
        <details className="relative ml-auto"><summary className="btn cursor-pointer list-none">⋯</summary>
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-line bg-white py-1 text-sm shadow-lg">
            <Link className="block px-3 py-1.5 hover:bg-neutral-50" href={`${here}?edit=1`}>Edit</Link>
            {i.status !== "DECLINED" && <form action={declineInterview.bind(null, i.id)}><button className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50">Mark declined</button></form>}
            {i.status !== "CANCELLED" && <form action={cancelInterview.bind(null, i.id)}><ConfirmButton message="Cancel this interview? Any calendar entry is removed." className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50">Cancel interview</ConfirmButton></form>}
            <form action={deleteInterview.bind(null, i.id)}><ConfirmButton message="Delete this interview request?" className="block w-full px-3 py-1.5 text-left text-bad hover:bg-red-50">Delete</ConfirmButton></form>
          </div>
        </details>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card title="Proposed times" right={i.status === "REQUESTED" && times.length ? <form action={proposeInterview.bind(null, i.id)}><button className="btn">Mark as proposed</button></form> : undefined}>
            {times.length ? (
              <form action={confirmInterview.bind(null, i.id)} className="space-y-1 text-sm">
                {times.map((t, n) => (
                  <label key={t} className={`flex items-center gap-2 rounded border px-2 py-1.5 ${i.confirmedAt && new Date(t).getTime() === i.confirmedAt.getTime() ? "border-good bg-green-50" : "border-line"}`}>
                    <input type="radio" name="time" value={t} defaultChecked={i.confirmedAt ? new Date(t).getTime() === i.confirmedAt.getTime() : n === 0} disabled={ended} />
                    <span>{fmt(t)}</span>
                    {i.confirmedAt && new Date(t).getTime() === i.confirmedAt.getTime() && <span className="pill ml-auto bg-green-50 text-good">confirmed</span>}
                  </label>
                ))}
                {!ended && <button className="btn btn-primary mt-2">{i.status === "CONFIRMED" ? "Move confirmed time" : "Confirm selected time"}</button>}
              </form>
            ) : <p className="text-sm text-neutral-500">No times proposed yet. <Link href={`${here}?edit=1`} className="underline">Add some</Link>.</p>}
            {i.status === "CONFIRMED" && <p className="mt-2 text-xs text-neutral-500">{event ? <>On the calendar as "{event.title}". <Link href="/planning/calendar" className="underline">Open calendar</Link>.</> : "Calendar entry will be created on confirm."}</p>}
          </Card>

          {(i.status === "CONFIRMED" || i.status === "COMPLETED") && (
            <Card title="Outcome">
              {i.status === "COMPLETED" ? <p className="whitespace-pre-wrap text-sm">{i.outcome ?? <span className="text-neutral-500">No outcome recorded.</span>}</p> : (
                <form action={completeInterview.bind(null, i.id)}>
                  <textarea name="outcome" className="input" rows={3} defaultValue={i.outcome ?? ""} placeholder="How did it go? Link to the segment if there is one." aria-label="Outcome" />
                  <button className="btn btn-primary mt-2">Mark completed</button>
                </form>
              )}
            </Card>
          )}
          {ended && i.status !== "COMPLETED" && i.outcome && <Card title="Notes"><p className="whitespace-pre-wrap text-sm">{i.outcome}</p></Card>}
        </div>

        <aside className="space-y-4">
          <Card title="Details" right={<Link href={`${here}?edit=1`} className="text-xs underline">Edit</Link>}>
            <Row k="Outlet" val={i.outletName} />
            <Row k="Journalist" val={contact ? <Link href={`/contacts/${contact.id}`} className="underline">{contact.name}</Link> : null} />
            <Row k="Email" val={contact?.email ? <a href={`mailto:${contact.email}`} className="underline">{contact.email}</a> : null} />
            <Row k="Spokesperson" val={i.spokesperson} />
            <Row k="Format" val={humanize(i.format)} />
            <Row k="Status" val={<StatusPill status={i.status} />} />
            <Row k="Confirmed" val={fmt(i.confirmedAt)} />
            <Row k="Created" val={fmt(i.createdAt)} />
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
              <input type="hidden" name="entity" value="interview" /><input type="hidden" name="entityId" value={i.id} />
              <select name="assetId" className="input" required defaultValue="" aria-label="Asset from library"><option value="" disabled>{assets.length ? "Attach from library" : "Library is empty"}</option>{assets.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              <button className="btn" disabled={!assets.length}>Attach</button>
            </form>
          </Card>
        </aside>
      </div>
    </div>
  );
}
