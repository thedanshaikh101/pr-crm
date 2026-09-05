import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { INTERVIEW_STATUSES, ageLabel, humanize, nextProposed, proposedTimesOf } from "@/lib/responseDesk/labels";
import { EmptyState, Fab, StatusPill, fmt } from "@/components/responseDesk/ui";

const COLUMNS: { key: string; label: string; statuses: string[] }[] = [
  { key: "REQUESTED", label: "Requested", statuses: ["REQUESTED"] },
  { key: "PROPOSED", label: "Times proposed", statuses: ["PROPOSED"] },
  { key: "CONFIRMED", label: "Confirmed", statuses: ["CONFIRMED"] },
  { key: "COMPLETED", label: "Completed", statuses: ["COMPLETED"] },
  { key: "ENDED", label: "Declined or cancelled", statuses: ["DECLINED", "CANCELLED"] },
];

export default async function InterviewsPage({ searchParams }: { searchParams: { view?: string; status?: string } }) {
  const v = await requireViewer();
  const view = searchParams.view === "table" ? "table" : "board";
  const now = new Date();
  const where: any = { accountId: v.account.id };
  if (view === "table" && searchParams.status && (INTERVIEW_STATUSES as readonly string[]).includes(searchParams.status)) where.status = searchParams.status;
  const rows = await db.interviewRequest.findMany({ where, orderBy: [{ updatedAt: "desc" }], take: 300, include: { contact: { select: { id: true, firstName: true, lastName: true } } } });
  const label = (i: any) => i.outletName ?? (i.contact ? `${i.contact.firstName} ${i.contact.lastName}` : "Unknown outlet");
  const when = (i: any) => {
    if (i.confirmedAt) return { text: `Confirmed ${fmt(i.confirmedAt)}`, tone: "text-good" };
    const n = nextProposed(proposedTimesOf(i.proposedTimes), now);
    return n ? { text: `Proposed ${fmt(n)}`, tone: "text-neutral-600" } : { text: "No times yet", tone: "text-neutral-400" };
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Interview requests</h1>
        <div className="flex gap-2">
          <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="View">
            <Link href="/response-desk/interviews?view=board" className={`px-2.5 py-1.5 text-sm ${view === "board" ? "bg-accentSoft text-accent" : "bg-white"}`}>Board</Link>
            <Link href="/response-desk/interviews?view=table" className={`px-2.5 py-1.5 text-sm ${view === "table" ? "bg-accentSoft text-accent" : "bg-white"}`}>Table</Link>
          </div>
          <Link href="/response-desk/interviews/new" className="btn btn-primary">New request</Link>
        </div>
      </div>

      {!rows.length && <EmptyState title={searchParams.status ? "No requests with that status." : "No interview requests yet."} hint="Track every ask for a spokesperson from first contact to the confirmed slot." action={{ href: "/response-desk/interviews/new", label: "New interview request" }} />}

      {rows.length > 0 && view === "board" && (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = rows.filter((i: any) => col.statuses.includes(i.status));
            return (
              <section key={col.key} className="rounded-lg border border-line bg-neutral-50 p-2">
                <h2 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-neutral-600">{col.label}<span className="rounded-full bg-white px-1.5 text-neutral-500">{items.length}</span></h2>
                <div className="space-y-2">
                  {items.map((i: any) => { const w = when(i); return (
                    <Link key={i.id} href={`/response-desk/interviews/${i.id}`} className="card block p-3 text-sm hover:bg-white/80">
                      <p className="font-medium">{label(i)}</p>
                      <p className="text-xs text-neutral-600">{i.spokesperson} · {humanize(i.format)}</p>
                      <p className={`mt-1 text-xs ${w.tone}`}>{w.text}</p>
                      <p className="mt-1 flex items-center justify-between text-xs text-neutral-400"><span>{ageLabel(i.createdAt, now)}</span>{col.statuses.length > 1 && <StatusPill status={i.status} />}</p>
                    </Link>
                  ); })}
                  {!items.length && <p className="px-1 py-3 text-center text-xs text-neutral-400">Empty</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {rows.length > 0 && view === "table" && (
        <div>
          <form method="get" className="mb-2 flex gap-2"><input type="hidden" name="view" value="table" />
            <select name="status" className="input w-auto" defaultValue={searchParams.status ?? ""} aria-label="Status"><option value="">Any status</option>{INTERVIEW_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select><button className="btn">Apply</button></form>
          <div className="card overflow-x-auto"><table className="data"><thead><tr><th>Outlet / contact</th><th>Spokesperson</th><th>Format</th><th>Status</th><th>Next time</th><th>Age</th></tr></thead>
            <tbody>{rows.map((i: any) => { const w = when(i); return (
              <tr key={i.id}>
                <td><Link href={`/response-desk/interviews/${i.id}`} className="font-medium hover:underline">{label(i)}</Link>{i.contact && <span className="block text-xs text-neutral-600">{i.contact.firstName} {i.contact.lastName}</span>}</td>
                <td>{i.spokesperson}</td><td className="text-xs">{humanize(i.format)}</td><td><StatusPill status={i.status} /></td><td className={`text-xs ${w.tone}`}>{w.text}</td><td className="text-xs text-neutral-500">{ageLabel(i.createdAt, now)}</td>
              </tr>
            ); })}</tbody></table></div>
        </div>
      )}
      <Fab href="/response-desk/interviews/new" label="New interview request" />
    </div>
  );
}
