import { ContactPicker } from "./ContactPicker";
import { toLocalInput } from "./ui";
import { CHANNELS, DEFAULT_CASE_TYPES, humanize, selectOptions } from "@/lib/responseDesk/labels";

export function ConversationForm({ action, c, contact, caseTypes, team, topics, submitLabel, defaultAssignee }: {
  action: (fd: FormData) => void | Promise<void>;
  c?: { outletName: string | null; channel: string; caseType: string | null; receivedAt: Date; deadline: Date | null; question: string; assigneeId: string | null; topicId: string | null } | null;
  contact?: { id: string; name: string; outlet: string | null; email: string | null } | null;
  caseTypes: string[];
  team: { id: string; name: string }[];
  topics: { id: string; name: string; status: string }[];
  submitLabel: string;
  defaultAssignee?: string;
}) {
  return (
    <form action={action} className="card max-w-3xl space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <ContactPicker defaultContact={contact ?? null} />
        <div><label className="label" htmlFor="c-outlet">Outlet</label><input id="c-outlet" name="outletName" className="input" defaultValue={c?.outletName ?? contact?.outlet ?? ""} placeholder="Outlet or programme name" /></div>
        <div><label className="label" htmlFor="c-channel">Channel</label><select id="c-channel" name="channel" className="input" defaultValue={c?.channel ?? "EMAIL"}>{CHANNELS.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</select></div>
        <div><label className="label" htmlFor="c-case">Case type</label><select id="c-case" name="caseType" className="input" defaultValue={c?.caseType ?? ""}><option value="">Not set</option>{selectOptions(caseTypes, DEFAULT_CASE_TYPES, c?.caseType).map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
        <div><label className="label" htmlFor="c-received">Received</label><input id="c-received" type="datetime-local" name="receivedAt" className="input" defaultValue={toLocalInput(c?.receivedAt ?? new Date())} /></div>
        <div><label className="label" htmlFor="c-deadline">Deadline</label><input id="c-deadline" type="datetime-local" name="deadline" className="input" defaultValue={toLocalInput(c?.deadline)} /></div>
        <div><label className="label" htmlFor="c-assignee">Assignee</label><select id="c-assignee" name="assigneeId" className="input" defaultValue={c?.assigneeId ?? defaultAssignee ?? ""}><option value="">Unassigned</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <div><label className="label" htmlFor="c-topic">Topic</label><select id="c-topic" name="topicId" className="input" defaultValue={c?.topicId ?? ""}><option value="">No topic</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}{t.status === "CLOSED" ? " (closed)" : ""}</option>)}</select></div>
      </div>
      <div><label className="label" htmlFor="c-question">Question</label><textarea id="c-question" name="question" className="input" rows={5} required defaultValue={c?.question ?? ""} placeholder="What the journalist is asking for, in their words" /></div>
      <button className="btn btn-primary">{submitLabel}</button>
    </form>
  );
}
