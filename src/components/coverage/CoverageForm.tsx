"use client";
import { useState } from "react";
import { COVERAGE_FOCUS, COVERAGE_TYPES, SENTIMENTS, titleCase } from "@/lib/coverage/filters";

export type Opt = { id: string; name: string };
export type CoverageDefaults = Partial<{
  outletName: string; headline: string; url: string; publishedAt: string; type: string; focus: string; sentiment: string; summary: string; notes: string;
  estimatedReach: number | string; adValue: number | string; imageUrl: string; outletLogoUrl: string; clientId: string; releaseId: string; organizationId: string; contactId: string; tagIds: string[];
}>;
export type CoverageFormOptions = { clients: Opt[]; releases: Opt[]; orgs: Opt[]; contacts: Opt[]; tags: (Opt & { color: string })[] };
export type Suggestions = { organizations: Opt[]; contacts: Opt[] };

const F = ({ name, label, type = "text", value, placeholder, required, span }: { name: string; label: string; type?: string; value?: any; placeholder?: string; required?: boolean; span?: boolean }) => (
  <div className={span ? "sm:col-span-2" : ""}><label className="label" htmlFor={`cov-${name}`}>{label}</label><input className="input" id={`cov-${name}`} name={name} type={type} defaultValue={value ?? ""} placeholder={placeholder} required={required} /></div>
);
const Sel = ({ name, label, value, opts, none }: { name: string; label: string; value?: string; opts: readonly string[] | Opt[]; none?: string }) => (
  <div><label className="label" htmlFor={`cov-${name}`}>{label}</label>
    <select className="input" id={`cov-${name}`} name={name} defaultValue={value ?? ""}>
      {none !== undefined && <option value="">{none}</option>}
      {(opts as any[]).map((o) => typeof o === "string" ? <option key={o} value={o}>{titleCase(o)}</option> : <option key={o.id} value={o.id}>{o.name}</option>)}
    </select></div>
);
const Chips = ({ items, current, onPick, label }: { items: Opt[]; current: string; onPick: (id: string) => void; label: string }) => items.length ? (
  <div className="mt-1 flex flex-wrap gap-1" aria-label={label}>
    {items.map((o) => <button type="button" key={o.id} className={`chip ${current === o.id ? "ring-2 ring-accent" : ""}`} onClick={() => onPick(current === o.id ? "" : o.id)}>{current === o.id ? "✓ " : ""}{o.name}</button>)}
  </div>
) : null;

export function CoverageForm({ action, defaults = {}, options, suggestions, submitLabel, cancelHref }: {
  action: (fd: FormData) => Promise<void>; defaults?: CoverageDefaults; options: CoverageFormOptions; suggestions?: Suggestions; submitLabel: string; cancelHref?: string;
}) {
  const d = defaults;
  const [orgId, setOrgId] = useState(d.organizationId ?? "");
  const [contactId, setContactId] = useState(d.contactId ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      action={async (fd: FormData) => { setError(null); try { await action(fd); } catch (e) { const m = (e as Error).message ?? ""; if (/NEXT_REDIRECT/.test(m)) throw e; setError(m || "Could not save. Check the fields and try again."); } }}
      className="card grid max-w-3xl gap-3 p-5 sm:grid-cols-2"
    >
      {error && <p className="text-sm text-bad sm:col-span-2" role="alert">{error}</p>}
      <F name="outletName" label="Outlet" value={d.outletName} required />
      <F name="headline" label="Headline" value={d.headline} required />
      <F name="url" label="URL" type="url" value={d.url} placeholder="https://" span />
      <F name="publishedAt" label="Published date" type="date" value={d.publishedAt ? String(d.publishedAt).slice(0, 10) : new Date().toISOString().slice(0, 10)} required />
      <Sel name="type" label="Type" value={d.type ?? "ONLINE"} opts={COVERAGE_TYPES} />
      <Sel name="focus" label="Focus" value={d.focus ?? "NATIONAL"} opts={COVERAGE_FOCUS} />
      <Sel name="sentiment" label="Sentiment" value={d.sentiment ?? "NEUTRAL"} opts={SENTIMENTS} />
      <F name="estimatedReach" label="Estimated reach" type="number" value={d.estimatedReach} placeholder="Unique audience" />
      <F name="adValue" label="AVE (advertising value, CAD)" type="number" value={d.adValue} placeholder="0.00" />
      <div className="sm:col-span-2"><label className="label" htmlFor="cov-summary">Summary</label><textarea className="input" id="cov-summary" name="summary" rows={2} defaultValue={d.summary ?? ""} /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="cov-notes">Notes</label><textarea className="input" id="cov-notes" name="notes" rows={3} defaultValue={d.notes ?? ""} placeholder="Internal notes, not shown in reports" /></div>
      <F name="imageUrl" label="Image URL" type="url" value={d.imageUrl} />
      <F name="outletLogoUrl" label="Outlet logo URL" type="url" value={d.outletLogoUrl} placeholder="Used when the organization has no logo" />
      <Sel name="clientId" label="Client" value={d.clientId} opts={options.clients} none="No client" />
      <Sel name="releaseId" label="Release" value={d.releaseId} opts={options.releases} none="Not linked to a release" />
      <div>
        <label className="label" htmlFor="cov-organizationId">Organization</label>
        <select className="input" id="cov-organizationId" name="organizationId" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          <option value="">Not linked</option>{options.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {suggestions && <Chips items={suggestions.organizations} current={orgId} onPick={setOrgId} label="Suggested organizations" />}
      </div>
      <div>
        <label className="label" htmlFor="cov-contactId">Journalist</label>
        <select className="input" id="cov-contactId" name="contactId" value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">Not linked</option>{options.contacts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {suggestions && <Chips items={suggestions.contacts} current={contactId} onPick={setContactId} label="Suggested contacts" />}
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="label">Tags</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {options.tags.map((t) => <label key={t.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="tagIds" value={t.id} defaultChecked={d.tagIds?.includes(t.id)} /><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />{t.name}</label>)}
          {!options.tags.length && <span className="text-xs text-neutral-500">No tags yet.</span>}
        </div>
        <input className="input mt-2" name="newTags" placeholder="New tags, separated by commas" aria-label="New tags" />
      </fieldset>
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary">{submitLabel}</button>
        {cancelHref && <a className="btn" href={cancelHref}>Cancel</a>}
      </div>
    </form>
  );
}
