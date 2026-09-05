import Link from "next/link";
import { ContactPicker } from "./ContactPicker";
import { ProposedTimesInput } from "./ProposedTimesInput";
import { INTERVIEW_FORMATS, INTERVIEW_STATUSES, humanize } from "@/lib/responseDesk/labels";

export function InterviewForm({ action, i, contact, times = [], submitLabel, conversationId }: {
  action: (fd: FormData) => void | Promise<void>;
  i?: { outletName: string | null; spokesperson: string; format: string; status: string; outcome: string | null } | null;
  contact?: { id: string; name: string; outlet: string | null; email: string | null } | null;
  times?: string[];
  submitLabel: string;
  conversationId?: string;
}) {
  return (
    <form action={action} className="card max-w-3xl space-y-3 p-4">
      {conversationId && <p className="rounded bg-accentSoft/50 px-3 py-2 text-xs text-neutral-700">Started from a conversation. <Link href={`/response-desk/conversations/${conversationId}`} className="underline">Open it</Link> to keep both in view; the link is not stored on the request.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <ContactPicker defaultContact={contact ?? null} label="Journalist" />
        <div><label className="label" htmlFor="i-outlet">Outlet</label><input id="i-outlet" name="outletName" className="input" defaultValue={i?.outletName ?? contact?.outlet ?? ""} placeholder="Outlet or programme" /></div>
        <div><label className="label" htmlFor="i-spokes">Spokesperson</label><input id="i-spokes" name="spokesperson" className="input" required defaultValue={i?.spokesperson ?? ""} placeholder="Who will speak" /></div>
        <div><label className="label" htmlFor="i-format">Format</label><select id="i-format" name="format" className="input" defaultValue={i?.format ?? "PHONE"}>{INTERVIEW_FORMATS.map((f) => <option key={f} value={f}>{humanize(f)}</option>)}</select></div>
        {i && <div><label className="label" htmlFor="i-status">Status</label><select id="i-status" name="status" className="input" defaultValue={i.status}>{INTERVIEW_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select></div>}
      </div>
      <ProposedTimesInput defaultTimes={times} />
      {i && <div><label className="label" htmlFor="i-outcome">Outcome</label><textarea id="i-outcome" name="outcome" className="input" rows={3} defaultValue={i.outcome ?? ""} placeholder="How it went, links to the segment" /></div>}
      <button className="btn btn-primary">{submitLabel}</button>
    </form>
  );
}
