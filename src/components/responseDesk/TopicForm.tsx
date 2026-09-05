import { RichTextEditor } from "@/components/RichTextEditor";
import { TOPIC_STATUSES, humanize, selectOptions, DEFAULT_TOPIC_TYPES } from "@/lib/responseDesk/labels";

export function TopicForm({ action, topic, themes, types, team, submitLabel }: {
  action: (fd: FormData) => void | Promise<void>;
  topic?: { name: string; themeId: string | null; topicType: string | null; status: string; ownerId: string | null; description: string | null } | null;
  themes: { id: string; name: string }[];
  types: string[];
  team: { id: string; name: string }[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="card max-w-3xl space-y-3 p-4">
      <div><label className="label" htmlFor="t-name">Name</label><input id="t-name" name="name" className="input" required defaultValue={topic?.name ?? ""} placeholder="What is the issue called internally" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="t-theme">Theme</label><select id="t-theme" name="themeId" className="input" defaultValue={topic?.themeId ?? ""}><option value="">No theme</option>{themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><label className="label" htmlFor="t-type">Topic type</label><select id="t-type" name="topicType" className="input" defaultValue={topic?.topicType ?? ""}><option value="">Not set</option>{selectOptions(types, DEFAULT_TOPIC_TYPES, topic?.topicType).map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
        <div><label className="label" htmlFor="t-status">Status</label><select id="t-status" name="status" className="input" defaultValue={topic?.status ?? "OPEN"}>{TOPIC_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select></div>
        <div><label className="label" htmlFor="t-owner">Owner</label><select id="t-owner" name="ownerId" className="input" defaultValue={topic?.ownerId ?? ""}><option value="">Unassigned</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
      </div>
      <div><span className="label">Description</span><RichTextEditor name="description" compact minHeight={140} defaultValue={topic?.description ?? ""} placeholder="Background, key messages, who is speaking on this" /></div>
      <button className="btn btn-primary">{submitLabel}</button>
    </form>
  );
}
