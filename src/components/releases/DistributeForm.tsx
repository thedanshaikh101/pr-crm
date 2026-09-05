"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { createDistribution, previewRecipients, type DistributionInputT, type RecipientSummary } from "@/server/distributions";

type ListOpt = { id: string; name: string; isSmart: boolean; count: number };
const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => <div><span className="label">{label}</span>{children}{hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}</div>;

type ContactHit = { id: string; name: string; outlet: string | null; email: string | null; emailStatus: string };

export function DistributeForm({ releaseId, headline, lists, fromOptions, defaults, timezone, base, viewerEmail, hasVerifiedDomain }: {
  releaseId: string; headline: string; lists: ListOpt[]; fromOptions: string[]; defaults: { fromName: string; fromEmail: string; replyTo: string; proactivity: string };
  timezone: string; base: string; viewerEmail: string; hasVerifiedDomain: boolean;
}) {
  const router = useRouter();
  const [listIds, setListIds] = useState<string[]>([]);
  const [contacts, setContacts] = useState<ContactHit[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [adhoc, setAdhoc] = useState("");
  const [summary, setSummary] = useState<RecipientSummary | null>(null);
  const [subject, setSubject] = useState(headline);
  const [preheader, setPreheader] = useState("");
  const [fromName, setFromName] = useState(defaults.fromName);
  const [fromEmail, setFromEmail] = useState(defaults.fromEmail || fromOptions[0] || "");
  const [fromCustom, setFromCustom] = useState(false);
  const [replyTo, setReplyTo] = useState(defaults.replyTo);
  const [intro, setIntro] = useState("");
  const [teaserMode, setTeaserMode] = useState(false);
  const [label, setLabel] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [proactivity, setProactivity] = useState(defaults.proactivity);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Live recipient summary, debounced.
  useEffect(() => {
    clearTimeout(timer.current);
    if (!listIds.length && !contacts.length && !adhoc.trim()) { setSummary(null); return; }
    timer.current = setTimeout(async () => { try { setSummary(await previewRecipients({ listIds, contactIds: contacts.map((c) => c.id), adhoc })); } catch { /* keep last */ } }, 400);
    return () => clearTimeout(timer.current);
  }, [listIds, contacts, adhoc]);

  // Contact typeahead.
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/releases/contacts?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal }); if (r.ok) setHits(await r.json()); } catch { /* aborted */ }
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const submit = (intent: "test" | "now" | "schedule") => start(async () => {
    setError("");
    const input: DistributionInputT = { intent, listIds, contactIds: contacts.map((c) => c.id), adhoc, subject, preheader, fromName, fromEmail, replyTo, intro, teaserMode, label, scheduledFor, proactivity: proactivity as any };
    const r = await createDistribution(releaseId, input);
    if (!r.ok) { setError(r.error); return; }
    router.push(r.redirectTo);
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">1. Recipients</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <span className="label">Lists</span>
              {lists.length ? (
                <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-line p-2 text-sm">{lists.map((l) => (
                  <li key={l.id}><label className="flex items-center gap-2"><input type="checkbox" checked={listIds.includes(l.id)} onChange={(e) => setListIds(e.target.checked ? [...listIds, l.id] : listIds.filter((x) => x !== l.id))} /><span className="flex-1">{l.name}{l.isSmart && <span className="ml-1 text-xs text-accent">⟳</span>}</span><span className="text-xs text-neutral-500">{l.count}</span></label></li>
                ))}</ul>
              ) : <p className="text-sm text-neutral-500">No lists yet. <Link href="/lists/new" className="underline">Create one</Link>.</p>}
            </div>
            <div className="space-y-3">
              <div className="relative">
                <label className="label" htmlFor="contact-q">Individual contacts</label>
                <input id="contact-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name, outlet or email" autoComplete="off" />
                {hits.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-line bg-white text-sm shadow-lg" role="listbox">{hits.map((h) => (
                    <li key={h.id}><button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-neutral-50" onClick={() => { if (!contacts.some((c) => c.id === h.id)) setContacts([...contacts, h]); setQ(""); setHits([]); }}>
                      <span className="font-medium">{h.name}</span><span className="text-xs text-neutral-500">{h.outlet}</span><span className="ml-auto text-xs text-neutral-400">{h.email ?? "no email"}{["BOUNCED", "INVALID", "UNSUBSCRIBED", "COMPLAINED"].includes(h.emailStatus) ? ` · ${h.emailStatus.toLowerCase()}` : ""}</span>
                    </button></li>
                  ))}</ul>
                )}
                {contacts.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{contacts.map((c) => <span key={c.id} className="chip inline-flex items-center gap-1">{c.name}<button type="button" aria-label={`Remove ${c.name}`} onClick={() => setContacts(contacts.filter((x) => x.id !== c.id))}>✕</button></span>)}</div>}
              </div>
              <div><label className="label" htmlFor="adhoc">Ad hoc emails</label><textarea id="adhoc" className="input font-mono text-xs" rows={4} value={adhoc} onChange={(e) => setAdhoc(e.target.value)} placeholder={"One per line\nJane Doe <jane@outlet.com>\nnews@outlet.com"} /></div>
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">2. Email wrapper</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Subject"><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} required /></Field>
            <Field label="Preheader" hint="Shown after the subject in most inboxes."><input className="input" value={preheader} onChange={(e) => setPreheader(e.target.value)} /></Field>
            <Field label="From name"><input className="input" value={fromName} onChange={(e) => setFromName(e.target.value)} required /></Field>
            <Field label="From email" hint={hasVerifiedDomain ? "Must use a verified sending domain." : "No verified sending domain yet. Add one under Settings, Sending Domains."}>
              {fromCustom || !fromOptions.length ? (
                <div className="flex gap-1"><input className="input" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="media@your-verified-domain.com" />{fromOptions.length > 0 && <button type="button" className="btn" onClick={() => { setFromCustom(false); setFromEmail(fromOptions[0]); }}>List</button>}</div>
              ) : (
                <select className="input" value={fromEmail} onChange={(e) => { if (e.target.value === "__custom") { setFromCustom(true); setFromEmail(""); } else setFromEmail(e.target.value); }}>{fromOptions.map((f) => <option key={f} value={f}>{f}</option>)}<option value="__custom">Other address on a verified domain…</option></select>
              )}
            </Field>
            <Field label="Reply-to" hint="Replies land here and are matched back to recipients."><input className="input" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} /></Field>
            <Field label="Label" hint="Internal name for this send."><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Live distribution" /></Field>
          </div>
          <div className="mt-3">
            <span className="label">Intro (above the release)</span>
            <RichTextEditor name="intro" compact minHeight={110} onChange={setIntro} placeholder="Hi {{first_name|there}}, thought this might suit {{outlet}}…" />
            <p className="mt-1 text-xs text-neutral-500">Merge fields: {"{{first_name|there}}"}, {"{{last_name}}"}, {"{{outlet}}"}, {"{{job_title}}"}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={teaserMode} onChange={(e) => setTeaserMode(e.target.checked)} /> Teaser mode (headline, subheadline and a Read the full release button)</label>
          </div>
          <fieldset className="mt-3 text-sm"><legend className="label">Proactivity</legend><div className="flex gap-4">{[["PROACTIVE", "Proactive"], ["REACTIVE", "Reactive"], ["UNSET", "Not set"]].map(([val, l]) => <label key={val} className="flex items-center gap-1"><input type="radio" name="proactivity" value={val} checked={proactivity === val} onChange={() => setProactivity(val)} />{l}</label>)}</div></fieldset>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">3. Send</h2>
          {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-bad">{error}</p>}
          <div className="flex flex-wrap items-end gap-3">
            <button type="button" className="btn" disabled={pending} onClick={() => submit("test")}>Send test to me ({viewerEmail})</button>
            <button type="button" className="btn btn-primary" disabled={pending || !summary?.sending} onClick={() => submit("now")}>Send now{summary ? ` to ${summary.sending}` : ""}</button>
            <div className="flex items-end gap-1">
              <div><label className="label" htmlFor="scheduledFor">Schedule ({timezone})</label><input id="scheduledFor" type="datetime-local" className="input" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} /></div>
              <button type="button" className="btn" disabled={pending || !scheduledFor || !summary?.sending} onClick={() => submit("schedule")}>Schedule</button>
            </div>
          </div>
          <p className="mt-2 text-xs text-neutral-500">Sending happens in the background at your account throttle. You can cancel a scheduled send while it is still queued.</p>
        </section>
      </div>

      <aside className="space-y-3">
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Recipient summary</h2>
          {summary ? (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-neutral-600">Selected</dt><dd>{summary.total}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-600">Unique after dedupe</dt><dd>{summary.unique}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-600">No valid email</dt><dd className={summary.noValidEmail ? "text-warn" : ""}>{summary.noValidEmail}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-600">On suppression list</dt><dd className={summary.suppressed ? "text-warn" : ""}>{summary.suppressed}</dd></div>
              <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Will be sent</dt><dd>{summary.sending}</dd></div>
            </dl>
          ) : <p className="text-sm text-neutral-500">Pick a list, add contacts, or paste emails to see who will receive this.</p>}
        </section>
        <section className="card p-4 text-xs text-neutral-600">
          <p>Bounced, unsubscribed, complained and invalid addresses are skipped automatically. Duplicates are removed by email, case-insensitive.</p>
        </section>
      </aside>
    </div>
  );
}
