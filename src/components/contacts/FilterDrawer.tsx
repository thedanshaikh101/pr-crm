"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CLASSIFICATIONS, FREQUENCIES, IMPORTANCE, toQuery, type ContactFilters } from "@/lib/contacts/filters";

type Opt = { id: string; name: string };

export function FilterDrawer({ f, orgs, lists, tags, teammates, subjects }: {
  f: ContactFilters; orgs: Opt[]; lists: Opt[]; tags: (Opt & { color: string })[]; teammates: Opt[]; subjects: { id: string; path: string; parentId: string | null }[];
}) {
  const router = useRouter();
  const [s, set] = useState<ContactFilters>(f);
  const [orgQ, setOrgQ] = useState("");
  const [audQ, setAudQ] = useState("");
  const toggle = <K extends keyof ContactFilters>(k: K, val: string) => {
    const cur = s[k] as unknown as string[];
    set({ ...s, [k]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val] });
  };
  const apply = () => router.push(`/contacts${toQuery({ ...s, page: 1 })}`);
  const orgsOnly = s.type.includes("orgs") && !s.type.includes("people");
  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <fieldset className="mb-4 border-b border-line pb-3"><legend className="mb-1.5 text-xs font-semibold text-neutral-600">{title}</legend>{children}</fieldset>
  );
  const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) => (
    <label className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" checked={checked} onChange={onChange} />{label}</label>
  );

  return (
    <div>
      <Group title="Sort and paging">
        <div className="flex gap-2">
          <select className="input" value={s.sort} onChange={(e) => set({ ...s, sort: e.target.value as any })} aria-label="Sort by">
            <option value="updated">Updated most recently</option><option value="name">Name A–Z</option><option value="outlet">Outlet</option><option value="followers">X followers</option>
          </select>
          <select className="input w-28" value={s.per} onChange={(e) => set({ ...s, per: Number(e.target.value) })} aria-label="Items per page">
            {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      </Group>
      <Group title="Record type">
        <Check label="People" checked={s.type.includes("people")} onChange={() => toggle("type", "people")} />
        <Check label="Organizations" checked={s.type.includes("orgs")} onChange={() => toggle("type", "orgs")} />
      </Group>
      <Group title="Basics">
        <Check label="With email addresses only" checked={s.emailOnly} onChange={() => set({ ...s, emailOnly: !s.emailOnly })} />
        <Check label="Include ex-journalists" checked={s.includeEx} onChange={() => set({ ...s, includeEx: !s.includeEx })} />
        <Check label="My contacts only" checked={s.mine} onChange={() => set({ ...s, mine: !s.mine })} />
      </Group>
      <Group title="Organization">
        <input className="input mb-1" placeholder="Type to find an outlet" value={orgQ} onChange={(e) => setOrgQ(e.target.value)} />
        <div className="max-h-32 overflow-auto">
          {orgs.filter((o) => !orgQ || o.name.toLowerCase().includes(orgQ.toLowerCase())).slice(0, 40).map((o) => <Check key={o.id} label={o.name} checked={s.org.includes(o.id)} onChange={() => toggle("org", o.id)} />)}
        </div>
      </Group>
      <Group title="Job title"><input className="input" value={s.title ?? ""} onChange={(e) => set({ ...s, title: e.target.value })} placeholder="e.g. producer, health reporter" /></Group>
      {orgsOnly && (
        <Group title="Publication frequency">{FREQUENCIES.map((x) => <Check key={x} label={x[0] + x.slice(1).toLowerCase()} checked={s.freq.includes(x)} onChange={() => toggle("freq", x)} />)}</Group>
      )}
      <Group title="Subjects">
        <div className="max-h-40 overflow-auto">
          {subjects.map((sub) => <Check key={sub.id} label={sub.parentId ? `  ↳ ${sub.path.split(" > ").pop()}` : sub.path} checked={s.subject.includes(sub.path)} onChange={() => toggle("subject", sub.path)} />)}
          {!subjects.length && <p className="text-xs text-neutral-500">Subjects appear here once contacts have them.</p>}
        </div>
      </Group>
      <Group title="Classifications">{CLASSIFICATIONS.map((x) => <Check key={x} label={x} checked={s.cls.includes(x)} onChange={() => toggle("cls", x)} />)}</Group>
      <Group title="Audience location">
        <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (audQ.trim()) { toggle("aud", audQ.trim()); setAudQ(""); } }}>
          <input className="input" value={audQ} onChange={(e) => setAudQ(e.target.value)} placeholder="Country, province/state, or city" /><button className="btn">Add</button>
        </form>
        <div className="mt-1 flex flex-wrap gap-1">{s.aud.map((a) => <button key={a} type="button" className="chip" onClick={() => toggle("aud", a)}>{a} ✕</button>)}</div>
      </Group>
      {!orgsOnly && <Group title="Physical location (people)"><input className="input" value={s.loc ?? ""} onChange={(e) => set({ ...s, loc: e.target.value })} placeholder="Where the person is based" /></Group>}
      <Group title="Language">{["English", "French", "Spanish", "Other"].map((x) => <Check key={x} label={x} checked={s.lang.includes(x)} onChange={() => toggle("lang", x)} />)}</Group>
      {orgsOnly && (
        <Group title="Domain authority">
          <div className="flex items-center gap-2"><input type="number" className="input" min={0} max={100} value={s.daMin ?? ""} onChange={(e) => set({ ...s, daMin: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="Min" /> to <input type="number" className="input" min={0} max={100} value={s.daMax ?? ""} onChange={(e) => set({ ...s, daMax: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="Max" /></div>
        </Group>
      )}
      <Group title="Contact method">
        {(["email", "phone", "mobile", "social"] as const).map((x) => <Check key={x} label={`Has ${x}`} checked={s.method.includes(x)} onChange={() => toggle("method", x)} />)}
      </Group>
      <Group title="Tags">
        {tags.map((t) => <Check key={t.id} label={t.name} checked={s.tag.includes(t.id)} onChange={() => toggle("tag", t.id)} />)}
        {!tags.length && <p className="text-xs text-neutral-500">No tags yet. Tag contacts from the table.</p>}
      </Group>
      <Group title="Importance">{IMPORTANCE.map((x) => <Check key={x} label={x.replace("_", " ").toLowerCase()} checked={s.imp.includes(x)} onChange={() => toggle("imp", x)} />)}</Group>
      <Group title="Relationship owner">{teammates.map((t) => <Check key={t.id} label={t.name} checked={s.owner.includes(t.id)} onChange={() => toggle("owner", t.id)} />)}</Group>
      <Group title="Lists">
        <Check label="Not in any list" checked={s.noList} onChange={() => set({ ...s, noList: !s.noList })} />
        <div className="max-h-32 overflow-auto">{lists.map((l) => <Check key={l.id} label={l.name} checked={s.list.includes(l.id)} onChange={() => toggle("list", l.id)} />)}</div>
      </Group>
      <div className="sticky bottom-0 flex gap-2 bg-white pt-2">
        <button className="btn btn-primary flex-1 justify-center" onClick={apply}>Apply filters</button>
        <button className="btn" onClick={() => router.push("/contacts")}>Clear all</button>
      </div>
    </div>
  );
}
