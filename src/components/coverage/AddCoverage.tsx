"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { fetchCoverageMeta, importCoverageUrls, type CoverageMetaResult, type ImportLineResult } from "@/server/coverage";
import { COVERAGE_TYPES, titleCase } from "@/lib/coverage/filters";
import { CoverageForm, type CoverageDefaults, type CoverageFormOptions, type Suggestions } from "./CoverageForm";

type Mode = "url" | "manual" | "paste";

export function AddCoverage({ action, options, prefill, initialMode }: { action: (fd: FormData) => Promise<void>; options: CoverageFormOptions; prefill: CoverageDefaults; initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [url, setUrl] = useState(prefill.url ?? "");
  const [defaults, setDefaults] = useState<CoverageDefaults>(prefill);
  const [suggestions, setSuggestions] = useState<Suggestions | undefined>();
  const [formKey, setFormKey] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [pasteText, setPasteText] = useState("");
  const [pasteDefaults, setPasteDefaults] = useState({ clientId: prefill.clientId ?? "", releaseId: prefill.releaseId ?? "", type: "ONLINE" });
  const [results, setResults] = useState<ImportLineResult[] | null>(null);

  const lookup = () => start(async () => {
    setNote(null);
    const m: CoverageMetaResult = await fetchCoverageMeta(url);
    setDefaults({
      ...prefill,
      url: m.canonicalUrl || url, headline: m.title ?? prefill.headline ?? "", outletName: m.outlet ?? "", publishedAt: m.publishedAt ? m.publishedAt.slice(0, 10) : undefined,
      imageUrl: m.image ?? "", summary: m.description ?? "", organizationId: m.organizations[0]?.id ?? "", contactId: m.contacts[0]?.id ?? "",
    });
    setSuggestions({ organizations: m.organizations, contacts: m.contacts });
    setFormKey((k) => k + 1);
    setNote(m.error ? `Could not read the page (${m.error}). Fill in the details by hand.` : `Found "${m.title ?? "untitled"}"${m.author ? ` by ${m.author}` : ""}. Check the fields before saving.`);
  });

  const runImport = () => start(async () => {
    setResults(await importCoverageUrls(pasteText, pasteDefaults));
  });

  const Tab = ({ m, label }: { m: Mode; label: string }) => (
    <button type="button" role="tab" aria-selected={mode === m} className={`rounded px-3 py-1.5 text-sm ${mode === m ? "bg-accentSoft font-medium text-accent" : "hover:bg-neutral-100"}`} onClick={() => setMode(m)}>{label}</button>
  );

  return (
    <div>
      <div className="mb-3 flex gap-1" role="tablist" aria-label="How to add coverage"><Tab m="url" label="From URL" /><Tab m="manual" label="Manual" /><Tab m="paste" label="Paste list" /></div>

      {mode === "url" && (
        <div className="mb-4 max-w-3xl">
          <form className="card flex flex-wrap items-end gap-2 p-4" onSubmit={(e) => { e.preventDefault(); if (url.trim()) lookup(); }}>
            <div className="min-w-[16rem] flex-1"><label className="label" htmlFor="lookup-url">Article URL</label><input id="lookup-url" className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.example.com/story" required /></div>
            <button className="btn btn-primary" disabled={pending}>{pending ? "Fetching…" : "Fetch details"}</button>
          </form>
          {note && <p className="mt-2 text-sm text-neutral-700" role="status">{note}</p>}
        </div>
      )}

      {mode !== "paste" && <CoverageForm key={`${mode}-${formKey}`} action={action} defaults={mode === "url" ? defaults : prefill} options={options} suggestions={mode === "url" ? suggestions : undefined} submitLabel="Save coverage" cancelHref="/coverage" />}

      {mode === "paste" && (
        <div className="max-w-3xl space-y-3">
          <div className="card grid gap-3 p-5 sm:grid-cols-3">
            <div className="sm:col-span-3"><label className="label" htmlFor="paste-urls">URLs, one per line (up to 50)</label><textarea id="paste-urls" className="input font-mono text-xs" rows={8} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"https://www.cbc.ca/news/...\nhttps://globalnews.ca/news/..."} /></div>
            <div><label className="label" htmlFor="paste-client">Client</label><select id="paste-client" className="input" value={pasteDefaults.clientId} onChange={(e) => setPasteDefaults({ ...pasteDefaults, clientId: e.target.value })}><option value="">No client</option>{options.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="label" htmlFor="paste-release">Release</label><select id="paste-release" className="input" value={pasteDefaults.releaseId} onChange={(e) => setPasteDefaults({ ...pasteDefaults, releaseId: e.target.value })}><option value="">Not linked</option>{options.releases.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="label" htmlFor="paste-type">Type</label><select id="paste-type" className="input" value={pasteDefaults.type} onChange={(e) => setPasteDefaults({ ...pasteDefaults, type: e.target.value })}>{COVERAGE_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></div>
            <div className="sm:col-span-3 flex gap-2"><button className="btn btn-primary" disabled={pending || !pasteText.trim()} onClick={runImport}>{pending ? "Importing…" : "Import URLs"}</button><Link href="/coverage" className="btn">Cancel</Link></div>
            <p className="text-xs text-neutral-500 sm:col-span-3">Each page is fetched in turn and logged with its title, outlet, date and image. Lines that fail are listed so you can add them by hand.</p>
          </div>
          {results && (
            <div className="card overflow-x-auto">
              <div className="border-b border-line px-3 py-2 text-sm">{results.filter((r) => r.ok).length} of {results.length} created</div>
              <table className="data"><thead><tr><th>URL</th><th>Result</th></tr></thead>
                <tbody>{results.map((r, i) => <tr key={i}><td className="max-w-md truncate text-xs"><a href={r.url} className="hover:underline" target="_blank" rel="noopener noreferrer">{r.url}</a></td><td className="text-sm">{r.ok ? <><span className="pill bg-green-50 text-good">created</span> <Link href={`/coverage/${r.id}`} className="hover:underline">{r.headline}</Link> <span className="text-xs text-neutral-500">{r.outlet}</span></> : <><span className="pill bg-red-50 text-bad">failed</span> {r.reason}{r.id && <> <Link href={`/coverage/${r.id}`} className="underline">open</Link></>}</>}</td></tr>)}</tbody></table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
