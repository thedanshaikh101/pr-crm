"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { COVERAGE_FOCUS, COVERAGE_TYPES, SENTIMENTS, titleCase, toQuery, type CoverageFilters } from "@/lib/coverage/filters";

type Opt = { id: string; name: string };

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <fieldset className="mb-4 border-b border-line pb-3"><legend className="mb-1.5 text-xs font-semibold text-neutral-600">{title}</legend>{children}</fieldset>
);
const Check = ({ label, checked, onChange }: { label: React.ReactNode; checked: boolean; onChange: () => void }) => (
  <label className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" checked={checked} onChange={onChange} />{label}</label>
);

export function CoverageFilterDrawer({ f, clients, releases, tags, orgs, contacts }: {
  f: CoverageFilters; clients: (Opt & { color: string })[]; releases: Opt[]; tags: (Opt & { color: string })[]; orgs: Opt[]; contacts: Opt[];
}) {
  const router = useRouter();
  const [s, set] = useState<CoverageFilters>(f);
  const [orgQ, setOrgQ] = useState("");
  const [contactQ, setContactQ] = useState("");
  const toggle = <K extends keyof CoverageFilters>(k: K, val: string) => {
    const cur = s[k] as unknown as string[];
    set({ ...s, [k]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val] });
  };
  const apply = () => router.push(`/coverage${toQuery({ ...s, page: 1 })}`);
  return (
    <div>
      <Group title="Sort and paging">
        <div className="flex gap-2">
          <select className="input" value={s.sort} onChange={(e) => set({ ...s, sort: e.target.value as any })} aria-label="Sort by">
            <option value="published">Newest first</option><option value="reach">Reach</option><option value="ave">AVE</option><option value="outlet">Outlet A to Z</option>
          </select>
          <select className="input w-28" value={s.per} onChange={(e) => set({ ...s, per: Number(e.target.value) })} aria-label="Items per page">
            {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      </Group>
      <Group title="Published between">
        <div className="flex items-center gap-2">
          <input type="date" className="input" aria-label="From date" value={s.from ?? ""} onChange={(e) => set({ ...s, from: e.target.value || undefined })} />
          <span className="text-xs text-neutral-500">to</span>
          <input type="date" className="input" aria-label="To date" value={s.to ?? ""} onChange={(e) => set({ ...s, to: e.target.value || undefined })} />
        </div>
      </Group>
      <Group title="Client">
        {clients.map((c) => <Check key={c.id} label={<span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: c.color }} />{c.name}</span>} checked={s.client.includes(c.id)} onChange={() => toggle("client", c.id)} />)}
        {!clients.length && <p className="text-xs text-neutral-500">No clients yet. Add them under Settings.</p>}
      </Group>
      <Group title="Release">
        <div className="max-h-32 overflow-auto">{releases.map((r) => <Check key={r.id} label={r.name} checked={s.release.includes(r.id)} onChange={() => toggle("release", r.id)} />)}</div>
        {!releases.length && <p className="text-xs text-neutral-500">No releases yet.</p>}
      </Group>
      <Group title="Type">{COVERAGE_TYPES.map((x) => <Check key={x} label={titleCase(x)} checked={s.type.includes(x)} onChange={() => toggle("type", x)} />)}</Group>
      <Group title="Focus">{COVERAGE_FOCUS.map((x) => <Check key={x} label={titleCase(x)} checked={s.focus.includes(x)} onChange={() => toggle("focus", x)} />)}</Group>
      <Group title="Sentiment">{SENTIMENTS.map((x) => <Check key={x} label={titleCase(x)} checked={s.sentiment.includes(x)} onChange={() => toggle("sentiment", x)} />)}</Group>
      <Group title="Tags">
        {tags.map((t) => <Check key={t.id} label={<span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: t.color }} />{t.name}</span>} checked={s.tag.includes(t.id)} onChange={() => toggle("tag", t.id)} />)}
        {!tags.length && <p className="text-xs text-neutral-500">No tags yet. Tag items from the table.</p>}
      </Group>
      <Group title="Organization">
        <input className="input mb-1" placeholder="Type to find an outlet" value={orgQ} onChange={(e) => setOrgQ(e.target.value)} />
        <div className="max-h-32 overflow-auto">
          {orgs.filter((o) => !orgQ || o.name.toLowerCase().includes(orgQ.toLowerCase())).slice(0, 40).map((o) => <Check key={o.id} label={o.name} checked={s.org.includes(o.id)} onChange={() => toggle("org", o.id)} />)}
        </div>
      </Group>
      <Group title="Contact">
        <input className="input mb-1" placeholder="Type to find a journalist" value={contactQ} onChange={(e) => setContactQ(e.target.value)} />
        <div className="max-h-32 overflow-auto">
          {contacts.filter((o) => contactQ ? o.name.toLowerCase().includes(contactQ.toLowerCase()) : s.contact.includes(o.id)).slice(0, 40).map((o) => <Check key={o.id} label={o.name} checked={s.contact.includes(o.id)} onChange={() => toggle("contact", o.id)} />)}
          {!contactQ && !s.contact.length && <p className="text-xs text-neutral-500">Start typing a name.</p>}
        </div>
      </Group>
      <Group title="Link">
        <Check label="Has a URL" checked={s.hasUrl} onChange={() => set({ ...s, hasUrl: !s.hasUrl })} />
      </Group>
      <div className="sticky bottom-0 flex gap-2 bg-white pt-2">
        <button className="btn btn-primary flex-1 justify-center" onClick={apply}>Apply filters</button>
        <button className="btn" onClick={() => router.push("/coverage")}>Clear all</button>
      </div>
    </div>
  );
}
