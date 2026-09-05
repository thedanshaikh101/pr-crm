"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toReleaseQuery, type ReleaseFilters } from "@/lib/releases/filters";

type Opt = { id: string; name: string; color?: string };

export function ReleaseFilterDrawer({ f, base, clients, tags }: { f: ReleaseFilters; base: string; clients: Opt[]; tags: Opt[] }) {
  const router = useRouter();
  const [s, set] = useState<ReleaseFilters>(f);
  const toggle = (k: "status" | "client" | "tag" | "pro", val: string) => {
    const cur = s[k] as string[];
    set({ ...s, [k]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val] });
  };
  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <fieldset className="mb-4 border-b border-line pb-3"><legend className="mb-1.5 text-xs font-semibold text-neutral-600">{title}</legend>{children}</fieldset>
  );
  const Check = ({ k, val, label }: { k: "status" | "client" | "tag" | "pro"; val: string; label: React.ReactNode }) => (
    <label className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" checked={(s[k] as string[]).includes(val)} onChange={() => toggle(k, val)} />{label}</label>
  );
  return (
    <div>
      <Group title="Sort">
        <select className="input" value={s.sort} onChange={(e) => set({ ...s, sort: e.target.value as ReleaseFilters["sort"] })} aria-label="Sort">
          <option value="updated">Last updated</option><option value="published">Published date</option><option value="headline">Headline A to Z</option>
        </select>
      </Group>
      <Group title="Status">{["DRAFT", "SCHEDULED", "LIVE", "ARCHIVED"].map((x) => <Check key={x} k="status" val={x} label={x.toLowerCase()} />)}</Group>
      <Group title="Client">{clients.length ? clients.map((c) => <Check key={c.id} k="client" val={c.id} label={<span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />{c.name}</span>} />) : <p className="text-xs text-neutral-500">No clients yet.</p>}</Group>
      <Group title="Tag">{tags.length ? tags.map((t) => <Check key={t.id} k="tag" val={t.id} label={t.name} />) : <p className="text-xs text-neutral-500">No tags yet.</p>}</Group>
      <Group title="Proactivity">{["PROACTIVE", "REACTIVE", "UNSET"].map((x) => <Check key={x} k="pro" val={x} label={x.toLowerCase()} />)}</Group>
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={() => router.push(`${base}${toReleaseQuery({ ...s, page: 1 })}`)}>Apply</button>
        <button className="btn" onClick={() => router.push(base)}>Clear</button>
      </div>
    </div>
  );
}
