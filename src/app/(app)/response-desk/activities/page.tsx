import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { createActivity, deleteActivity, toggleActivity, updateActivity } from "@/server/responseDesk";
import { teammates, nameOf } from "@/lib/responseDesk/data";
import { resolveEntityTitles } from "@/lib/responseDesk/entityTitles";
import { ACTIVITY_KINDS, entityHref, humanize, kindIcon, truncate } from "@/lib/responseDesk/labels";
import { ConfirmButton } from "@/components/responseDesk/ConfirmButton";
import { EmptyState, FilterSelect, fmt, toLocalInput } from "@/components/responseDesk/ui";

export default async function ActivitiesPage({ searchParams: raw }: { searchParams: Record<string, string | string[] | undefined> }) {
  const v = await requireViewer();
  const a = v.account.id;
  const now = new Date();
  // Repeated keys (the Mine checkbox next to its hidden "0") arrive as arrays; the last value wins.
  const searchParams: Record<string, string | undefined> = Object.fromEntries(Object.entries(raw).map(([k, val]) => [k, Array.isArray(val) ? val[val.length - 1] : val]));
  const mine = searchParams.mine === undefined ? true : searchParams.mine === "1" || searchParams.mine === "true";
  const { kind, state, assignee, entity, entityId, edit } = searchParams;
  const showNew = searchParams.new === "1" || !!entity;
  const where: any = { AND: [{ accountId: a }] };
  if (mine) where.AND.push({ assigneeId: v.user.id });
  else if (assignee) where.AND.push({ assigneeId: assignee === "none" ? null : assignee });
  if (kind && (ACTIVITY_KINDS as readonly string[]).includes(kind)) where.AND.push({ kind });
  if (state === "open") where.AND.push({ completedAt: null });
  if (state === "done") where.AND.push({ completedAt: { not: null } });
  if (state === "overdue") where.AND.push({ completedAt: null, dueAt: { lt: now } });
  const [rows, team] = await Promise.all([
    db.activity.findMany({ where, orderBy: [{ completedAt: { sort: "asc", nulls: "first" } }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 300 }),
    teammates(a),
  ]);
  const who = nameOf(team);
  const titleOf = await resolveEntityTitles(a, [...rows.map((r: any) => ({ entity: r.entity, entityId: r.entityId })), { entity: entity ?? null, entityId: entityId ?? null }]);
  const editing = edit ? rows.find((r: any) => r.id === edit) ?? (await db.activity.findFirst({ where: { id: edit, accountId: a } })) : null;
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { mine: mine ? "1" : "0", kind, state, assignee, ...patch };
    for (const [k, val] of Object.entries(next)) if (val) p.set(k, val);
    const s = p.toString();
    return `/response-desk/activities${s ? "?" + s : ""}`;
  };
  const linkedLabel = entity && entityId ? titleOf(entity, entityId) ?? entity : null;

  const Form = ({ x }: { x?: any }) => (
    <form action={x ? updateActivity.bind(null, x.id) : createActivity} className="card mb-4 grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_8rem_10rem_11rem_auto]">
      <input type="hidden" name="returnTo" value={qs({})} />
      {(x?.entity ?? entity) && <><input type="hidden" name="entity" value={x?.entity ?? entity} /><input type="hidden" name="entityId" value={x?.entityId ?? entityId} /></>}
      <div className="sm:col-span-2 lg:col-span-5 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{x ? "Edit activity" : "New activity"}</span>
        {(x ? titleOf(x.entity, x.entityId) : linkedLabel) && <span className="chip">Linked to {x ? `${x.entity}: ${titleOf(x.entity, x.entityId)}` : `${entity}: ${linkedLabel}`}</span>}
        <Link href={qs({})} className="ml-auto text-xs underline">Cancel</Link>
      </div>
      <div><label className="label" htmlFor="a-title">Title</label><input id="a-title" name="title" className="input" required defaultValue={x?.title ?? ""} placeholder="What needs doing" /></div>
      <div><label className="label" htmlFor="a-kind">Kind</label><select id="a-kind" name="kind" className="input" defaultValue={x?.kind ?? "TASK"}>{ACTIVITY_KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</select></div>
      <div><label className="label" htmlFor="a-assignee">Assignee</label><select id="a-assignee" name="assigneeId" className="input" defaultValue={x?.assigneeId ?? v.user.id}>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
      <div><label className="label" htmlFor="a-due">Due</label><input id="a-due" type="datetime-local" name="dueAt" className="input" defaultValue={toLocalInput(x?.dueAt)} /></div>
      <div className="flex items-end"><button className="btn btn-primary">{x ? "Save" : "Add"}</button></div>
      <div className="sm:col-span-2 lg:col-span-5"><label className="label" htmlFor="a-body">Notes</label><textarea id="a-body" name="body" className="input" rows={2} defaultValue={x?.body ?? ""} placeholder="Optional detail" /></div>
    </form>
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h1 className="text-xl font-semibold">{mine ? "My activities" : "Activities"}</h1>{!showNew && !editing && <Link href={qs({ new: "1" })} className="btn btn-primary">New activity</Link>}</div>
      {editing ? <Form x={editing} /> : showNew ? <Form /> : null}
      <form method="get" className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="mine" value="0" />
        <label className="flex items-center gap-1"><input type="checkbox" name="mine" value="1" defaultChecked={mine} /> Mine</label>
        <FilterSelect name="kind" value={kind} all="Any kind" options={ACTIVITY_KINDS.map((k) => ({ value: k, label: humanize(k) }))} />
        <FilterSelect name="state" value={state} all="Open and done" options={[{ value: "open", label: "Open" }, { value: "overdue", label: "Overdue" }, { value: "done", label: "Done" }]} />
        {!mine && <FilterSelect name="assignee" value={assignee} all="Any assignee" options={[...team.map((m) => ({ value: m.id, label: m.name })), { value: "none", label: "Unassigned" }]} />}
        <button className="btn">Apply</button>
        <Link href="/response-desk/activities?mine=0" className="btn">Reset</Link>
      </form>
      {rows.length ? (
        <div className="card overflow-x-auto"><table className="data"><thead><tr><th className="w-10">Done</th><th>Kind</th><th>Title</th><th>Linked to</th><th>Assignee</th><th>Due</th><th>Created by</th><th></th></tr></thead>
          <tbody>{rows.map((x: any) => {
            const href = entityHref(x.entity, x.entityId);
            const late = !x.completedAt && x.dueAt && x.dueAt < now;
            return (
              <tr key={x.id} className={x.completedAt ? "opacity-60" : ""}>
                <td><form action={async () => { "use server"; await toggleActivity(x.id); }}><button className="btn px-2 py-0.5" aria-label={x.completedAt ? "Mark not done" : "Mark done"} title={x.completedAt ? `Done ${fmt(x.completedAt)}` : "Mark done"}>{x.completedAt ? "☑" : "☐"}</button></form></td>
                <td className="text-xs"><span aria-hidden>{kindIcon(x.kind)}</span> {humanize(x.kind)}</td>
                <td><span className={x.completedAt ? "line-through" : "font-medium"}>{x.title}</span>{x.body && <p className="text-xs text-neutral-500">{truncate(x.body, 100)}</p>}</td>
                <td className="text-xs">{href ? <Link href={href} className="hover:underline">{titleOf(x.entity, x.entityId) ?? humanize(x.entity)}</Link> : x.entity ? `${x.entity}` : ""}</td>
                <td className="text-xs">{who(x.assigneeId) ?? <span className="text-neutral-400">Unassigned</span>}</td>
                <td className={`whitespace-nowrap text-xs ${late ? "text-bad font-medium" : ""}`}>{x.dueAt ? fmt(x.dueAt) : ""}{late && " (overdue)"}</td>
                <td className="text-xs text-neutral-500">{who(x.createdById) ?? ""}</td>
                <td className="whitespace-nowrap text-xs"><Link href={qs({ edit: x.id })} className="mr-2 underline">Edit</Link><form action={async () => { "use server"; await deleteActivity(x.id); }} className="inline"><ConfirmButton message="Delete this activity?" className="text-bad underline">Delete</ConfirmButton></form></td>
              </tr>
            );
          })}</tbody></table></div>
      ) : <EmptyState title={mine ? "Nothing assigned to you." : "No activities match."} hint="Tasks, calls, emails and meetings show up here with their due dates." action={{ href: qs({ new: "1" }), label: "New activity" }} />}
    </div>
  );
}
