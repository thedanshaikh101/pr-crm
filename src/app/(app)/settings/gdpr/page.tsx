import { requireViewer } from "@/lib/auth";
import { gdprPurge, gdprSearch } from "@/server/gdpr";
import { sampleLabel } from "@/lib/gdpr/search";
import { ConfirmButton } from "@/components/settings/ConfirmButton";

export default async function GdprPage({ searchParams }: { searchParams: { q?: string; done?: string; error?: string } }) {
  const v = await requireViewer();
  const isAdmin = v.role === "OWNER" || v.role === "ADMIN";
  if (!isAdmin) return <div className="card p-6"><h1 className="text-xl font-semibold">GDPR Data Clean</h1><p className="mt-2 text-sm text-neutral-600">Only owners and admins can search for and purge personal data.</p></div>;
  const q = (searchParams.q ?? "").trim();
  const matches = q.length >= 3 ? await gdprSearch(q) : null;
  let done: Record<string, number> | null = null;
  try { done = searchParams.done ? JSON.parse(searchParams.done) : null; } catch { done = null; }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">GDPR Data Clean</h1>
      <p className="text-sm text-neutral-600">Find everything the workspace holds about a person by email address or name, export it as JSON for a subject access request, or purge it. Purging hard-deletes contacts, redacts email recipients, scrubs notes and audit entries, and cannot be undone.</p>

      {done && (
        <div className="rounded-md border border-good bg-green-50 p-3 text-sm" role="status">
          <p className="font-medium text-good">Purge complete.</p>
          <p className="text-neutral-700">Contacts deleted: {done.contacts ?? 0}. Recipients redacted: {done.recipients ?? 0}. Suppressions removed: {done.suppressions ?? 0}. Invitations removed: {done.invitations ?? 0}. Notes scrubbed: {done.notes ?? 0}. Audit entries scrubbed: {done.auditLogs ?? 0}.</p>
        </div>
      )}
      {searchParams.error === "confirm" && <p className="text-sm text-bad">Type PURGE exactly to confirm.</p>}
      {searchParams.error === "short" && <p className="text-sm text-bad">Use at least three characters.</p>}

      <form className="card flex flex-wrap items-end gap-2 p-4" method="get">
        <div className="flex-1"><label className="label" htmlFor="gdpr-q">Email address or name</label><input id="gdpr-q" name="q" className="input" defaultValue={q} placeholder="jane.doe@outlet.com" minLength={3} required /></div>
        <button className="btn btn-primary">Search</button>
        {matches && matches.total > 0 && <a href={`/api/gdpr/export?q=${encodeURIComponent(q)}`} className="btn">Export JSON</a>}
      </form>

      {q && q.length < 3 && <p className="text-sm text-neutral-500">Use at least three characters.</p>}

      {matches && (
        <section className="space-y-3">
          <p className="text-sm">{matches.total ? `${matches.total.toLocaleString()} matching row${matches.total === 1 ? "" : "s"} across ${matches.groups.filter((g) => g.count).length} table${matches.groups.filter((g) => g.count).length === 1 ? "" : "s"}.` : "Nothing found. Try a different spelling or a bare last name."}</p>
          {matches.total > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {matches.groups.filter((g) => g.count).map((g) => (
                <div key={g.table} className="card p-3">
                  <div className="flex items-baseline justify-between"><h2 className="text-sm font-semibold">{g.table}</h2><span className="text-xs text-neutral-500">{g.count.toLocaleString()} row{g.count === 1 ? "" : "s"}</span></div>
                  <ul className="mt-1 space-y-0.5 text-xs text-neutral-700">
                    {g.samples.map((r) => <li key={String(r.id)} className="truncate">{sampleLabel(g.table, r)}</li>)}
                    {g.count > g.samples.length && <li className="text-neutral-400">and {g.count - g.samples.length} more</li>}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {matches.total > 0 && (
            <form action={gdprPurge} className="card border-bad p-4">
              <h2 className="text-sm font-semibold text-bad">Purge this person</h2>
              <p className="mt-1 text-xs text-neutral-600">Deletes the {matches.groups.find((g) => g.table === "Contact")?.count ?? 0} matching contact record(s) and their notes, tags and list memberships; nulls their link on coverage, conversations and interview requests; rewrites email recipients to a redacted address; removes suppression and invitation rows; replaces the search text in notes and audit entries with [redacted]. Sending statistics are kept in aggregate.</p>
              <input type="hidden" name="q" value={q} />
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div><label className="label" htmlFor="gdpr-confirm">Type PURGE to confirm</label><input id="gdpr-confirm" name="confirm" className="input w-40" autoComplete="off" required pattern="PURGE" /></div>
                <ConfirmButton title="Purge personal data" message={`Permanently remove ${matches.total} matching row${matches.total === 1 ? "" : "s"} for "${q}". This cannot be undone.`} confirmLabel="Purge now">Purge</ConfirmButton>
              </div>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
