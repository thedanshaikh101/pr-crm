"use client";
// Creation forms whose result (a plaintext key or secret) must be shown exactly once.
import { useFormState } from "react-dom";
import { createApiKey, createWebhookEndpoint } from "@/server/settings";
import { CopyCallout } from "./CopyCallout";

export function NewKeyForm() {
  const [s, act] = useFormState(createApiKey, {} as { key?: string; error?: string });
  return (
    <div className="space-y-3">
      {s?.key && <CopyCallout label="Your new API key" value={s.key} />}
      <form action={act} className="flex flex-wrap items-end gap-2">
        <div className="flex-1"><label className="label" htmlFor="k-name">Key name</label><input id="k-name" name="name" className="input" placeholder="Zapier, internal script" required /></div>
        <button className="btn btn-primary">Create key</button>
      </form>
      {s?.error && <p className="text-sm text-bad">{s.error}</p>}
    </div>
  );
}

export function NewEndpointForm({ events }: { events: readonly string[] }) {
  const [s, act] = useFormState(createWebhookEndpoint, {} as { secret?: string; error?: string });
  return (
    <div className="space-y-3">
      {s?.secret && <CopyCallout label="Signing secret for this endpoint" value={s.secret} note="Verify deliveries with HMAC-SHA256 over the raw body. This is shown once." />}
      <form action={act} className="space-y-2">
        <div><label className="label" htmlFor="w-url">Endpoint URL (https)</label><input id="w-url" name="url" type="url" className="input" placeholder="https://example.com/hooks/pressdesk" required pattern="https://.*" /></div>
        <fieldset><legend className="label">Events</legend>
          <div className="flex flex-wrap gap-3 text-sm">{events.map((e) => <label key={e} className="flex items-center gap-1"><input type="checkbox" name="events" value={e} defaultChecked={e === "release.published"} /> {e}</label>)}</div>
        </fieldset>
        {s?.error && <p className="text-sm text-bad">{s.error}</p>}
        <button className="btn btn-primary">Add endpoint</button>
      </form>
    </div>
  );
}
