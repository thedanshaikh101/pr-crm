"use client";
// Create/edit a client. The logo can be a URL or a file uploaded straight to storage
// (presigned PUT), after which the stored URL is written into the logoUrl field.
import { useState } from "react";
import { presignClientLogo } from "@/server/settings";

type Boilerplate = { id: string; name: string };

export function ClientForm({ action, client, boilerplates, submitLabel }: {
  action: (fd: FormData) => Promise<void>;
  client?: { id: string; name: string; color: string; logoUrl: string | null; defaultBoilerplateId: string | null } | null;
  boilerplates: Boilerplate[];
  submitLabel: string;
}) {
  const [logoUrl, setLogoUrl] = useState(client?.logoUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true); setErr(null);
    try {
      const { target, url } = await presignClientLogo(file.name, file.type || "image/png");
      const r = await fetch(target.url, { method: target.method, headers: target.headers, body: file });
      if (!r.ok) throw new Error(`Upload failed (${r.status})`);
      setLogoUrl(url);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <form action={action} className="card space-y-3 p-4">
      <div><label className="label" htmlFor="c-name">Name</label><input id="c-name" name="name" className="input" required defaultValue={client?.name ?? ""} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="c-color">Colour</label><input id="c-color" name="color" type="color" className="input h-9 p-1" defaultValue={client?.color ?? "#1F5FBF"} /></div>
        <div>
          <label className="label" htmlFor="c-boilerplate">Default boilerplate</label>
          <select id="c-boilerplate" name="defaultBoilerplateId" className="input" defaultValue={client?.defaultBoilerplateId ?? ""}>
            <option value="">None</option>
            {boilerplates.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="c-logo">Logo URL</label>
        <div className="flex items-center gap-2">
          {logoUrl ? <img src={logoUrl} alt="" className="h-9 w-9 rounded border border-line object-cover" /> : <span className="grid h-9 w-9 place-items-center rounded border border-dashed border-line text-xs text-neutral-400">none</span>}
          <input id="c-logo" name="logoUrl" className="input" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://" />
          <label className="btn cursor-pointer whitespace-nowrap">{busy ? "Uploading" : "Upload"}<input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} /></label>
        </div>
        {err && <p className="mt-1 text-sm text-bad">{err}</p>}
      </div>
      <div className="flex gap-2"><button className="btn btn-primary" disabled={busy}>{submitLabel}</button><a href="/settings/clients" className="btn">Cancel</a></div>
    </form>
  );
}
