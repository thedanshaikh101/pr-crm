import { RichTextEditor } from "@/components/RichTextEditor";
import { toLocalInput } from "./ui";

export function StatementForm({ action, s, topics, submitLabel }: {
  action: (fd: FormData) => void | Promise<void>;
  s?: { title: string; topicId: string | null; body: string; expiresAt: Date | null } | null;
  topics: { id: string; name: string; status: string }[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="card max-w-3xl space-y-3 p-4">
      <div><label className="label" htmlFor="s-title">Title</label><input id="s-title" name="title" className="input" required defaultValue={s?.title ?? ""} placeholder="Holding statement: ..." /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="s-topic">Topic</label><select id="s-topic" name="topicId" className="input" defaultValue={s?.topicId ?? ""}><option value="">No topic</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}{t.status === "CLOSED" ? " (closed)" : ""}</option>)}</select></div>
        <div><label className="label" htmlFor="s-expires">Expires</label><input id="s-expires" type="datetime-local" name="expiresAt" className="input" defaultValue={toLocalInput(s?.expiresAt)} /><p className="mt-1 text-xs text-neutral-500">An approved statement past this time reads as expired.</p></div>
      </div>
      <div><span className="label">Statement text</span><RichTextEditor name="body" minHeight={220} defaultValue={s?.body ?? ""} placeholder="The approved wording, ready to paste into a reply" /></div>
      <button className="btn btn-primary">{submitLabel}</button>
    </form>
  );
}
