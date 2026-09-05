import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSuccess, WEBHOOK_EVENTS } from "@/lib/settings/webhooks";
import { deleteWebhookEndpoint, revokeApiKey, sendTestWebhook, toggleWebhookEndpoint, updateWebhookEndpoint } from "@/server/settings";
import { NewEndpointForm, NewKeyForm } from "@/components/settings/ApiForms";
import { ConfirmButton } from "@/components/settings/ConfirmButton";

function StatusPill({ status, attempts, nextRetryAt }: { status: number | null; attempts: number; nextRetryAt: Date | null }) {
  if (isSuccess(status)) return <span className="pill bg-green-50 text-good">{status}</span>;
  if (status === null && attempts === 0) return <span className="pill bg-amber-50 text-warn">pending</span>;
  if (nextRetryAt) return <span className="pill bg-amber-50 text-warn">{status === 0 ? "network error" : status}, retrying</span>;
  return <span className="pill bg-red-50 text-bad">{status === 0 ? "network error" : status ?? "failed"}</span>;
}

export default async function ApiPage({ searchParams }: { searchParams: { endpoint?: string } }) {
  const v = await requireViewer();
  const isAdmin = v.role === "OWNER" || v.role === "ADMIN";
  if (!isAdmin) return <div className="card p-6"><h1 className="text-xl font-semibold">API keys and Webhooks</h1><p className="mt-2 text-sm text-neutral-600">Only owners and admins can manage API keys and webhooks.</p></div>;
  const [keys, endpoints] = await Promise.all([
    db.apiKey.findMany({ where: { accountId: v.account.id }, orderBy: { createdAt: "desc" } }),
    db.webhookEndpoint.findMany({ where: { accountId: v.account.id }, orderBy: { createdAt: "asc" }, include: { deliveries: { orderBy: { createdAt: "desc" }, take: 1 } } }),
  ]);
  const selected = searchParams.endpoint ? endpoints.find((e: any) => e.id === searchParams.endpoint) ?? null : null;
  const deliveries = selected ? await db.webhookDelivery.findMany({ where: { endpointId: selected.id }, orderBy: { createdAt: "desc" }, take: 20 }) : [];
  const base = process.env.APP_URL ?? "http://localhost:3000";

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">API keys and Webhooks</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">API keys</h2>
        <div className="card p-4"><NewKeyForm /></div>
        {keys.length ? (
          <div className="card overflow-x-auto">
            <table className="data">
              <thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {keys.map((k: any) => (
                  <tr key={k.id} className={k.revokedAt ? "opacity-60" : ""}>
                    <td className="font-medium">{k.name}</td>
                    <td><code className="text-xs">{k.prefix}…</code></td>
                    <td>{k.createdAt.toLocaleDateString()}</td>
                    <td>{k.lastUsedAt ? k.lastUsedAt.toLocaleString() : <span className="text-neutral-400">Never</span>}</td>
                    <td>{k.revokedAt ? <span className="pill bg-red-50 text-bad">revoked {k.revokedAt.toLocaleDateString()}</span> : <span className="pill bg-green-50 text-good">active</span>}</td>
                    <td className="text-right">{!k.revokedAt && <form action={revokeApiKey.bind(null, k.id)}><ConfirmButton title={`Revoke ${k.name}`} message="Requests with this key stop working immediately. This cannot be undone." confirmLabel="Revoke">Revoke</ConfirmButton></form>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-neutral-500">No API keys yet. Create one above to use the REST API.</p>}
        <div className="card p-4 text-sm">
          <h3 className="mb-1 font-semibold">Using the API</h3>
          <p className="text-neutral-600">Send the key as a bearer token. Keys act with the full account scope, so keep them server-side.</p>
          <pre className="mt-2 overflow-x-auto rounded bg-neutral-900 p-3 text-xs text-neutral-100">{`curl "${base}/api/v1/contacts?q=cbc&page=1&per=50" \\
  -H "Authorization: Bearer pd_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"`}</pre>
          <p className="mt-2 text-neutral-600">Endpoints: <code>GET /api/v1/contacts</code>, <code>POST /api/v1/contacts</code>, plus lists, releases and coverage. Full schema: <a href="/api/v1/openapi.json" className="underline">/api/v1/openapi.json</a>.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Webhook endpoints</h2>
        <div className="card p-4"><NewEndpointForm events={WEBHOOK_EVENTS} /></div>
        {endpoints.length ? (
          <div className="card overflow-x-auto">
            <table className="data">
              <thead><tr><th>URL</th><th>Events</th><th>Active</th><th>Created</th><th>Last delivery</th><th></th></tr></thead>
              <tbody>
                {endpoints.map((e: any) => {
                  const last = e.deliveries[0];
                  return (
                    <tr key={e.id} className={selected?.id === e.id ? "bg-accentSoft/40" : ""}>
                      <td className="max-w-xs truncate font-medium"><Link href={`/settings/api?endpoint=${e.id}`} className="hover:underline">{e.url}</Link></td>
                      <td><div className="flex flex-wrap gap-1">{e.events.map((ev: string) => <span key={ev} className="chip">{ev}</span>)}</div></td>
                      <td><form action={toggleWebhookEndpoint.bind(null, e.id, !e.active)}><button className={`pill ${e.active ? "bg-green-50 text-good" : "bg-neutral-100 text-neutral-600"}`} aria-pressed={e.active} aria-label={e.active ? "Deactivate endpoint" : "Activate endpoint"}>{e.active ? "on" : "off"}</button></form></td>
                      <td>{e.createdAt.toLocaleDateString()}</td>
                      <td>{last ? <><StatusPill status={last.status} attempts={last.attempts} nextRetryAt={last.nextRetryAt} /> <span className="text-xs text-neutral-500">{last.createdAt.toLocaleString()}</span></> : <span className="text-neutral-400">None</span>}</td>
                      <td className="text-right"><div className="flex justify-end gap-1"><form action={sendTestWebhook.bind(null, e.id)}><button className="btn">Send test</button></form><Link href={`/settings/api?endpoint=${e.id}`} className="btn">Details</Link></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-neutral-500">No endpoints yet. Pressdesk signs every delivery with HMAC-SHA256 in the X-Pressdesk-Signature header.</p>}

        {selected && (
          <div className="grid gap-3 lg:grid-cols-[20rem_1fr]">
            <form action={updateWebhookEndpoint.bind(null, selected.id)} className="card space-y-2 p-4">
              <h3 className="text-sm font-semibold">Edit endpoint</h3>
              <div><label className="label" htmlFor="e-url">URL</label><input id="e-url" name="url" type="url" className="input" defaultValue={selected.url} required pattern="https://.*" /></div>
              <fieldset><legend className="label">Events</legend>{WEBHOOK_EVENTS.map((ev) => <label key={ev} className="flex items-center gap-1 text-sm"><input type="checkbox" name="events" value={ev} defaultChecked={selected.events.includes(ev)} /> {ev}</label>)}</fieldset>
              <div className="flex gap-2"><button className="btn btn-primary">Save</button><Link href="/settings/api" className="btn">Close</Link></div>
              <p className="text-xs text-neutral-500">The signing secret was shown when the endpoint was created. Delete and recreate the endpoint to rotate it.</p>
            </form>
            <div className="space-y-3">
              <div className="card overflow-x-auto">
                <div className="flex items-center justify-between border-b border-line px-3 py-2"><h3 className="text-sm font-semibold">Recent deliveries</h3><form action={deleteWebhookEndpoint.bind(null, selected.id)}><ConfirmButton title="Delete endpoint" message="Its delivery log is removed too. This cannot be undone." confirmLabel="Delete endpoint">Delete endpoint</ConfirmButton></form></div>
                {deliveries.length ? (
                  <table className="data">
                    <thead><tr><th>Event</th><th>Status</th><th>Attempts</th><th>Next retry</th><th>Created</th><th>Payload</th></tr></thead>
                    <tbody>{deliveries.map((d: any) => (
                      <tr key={d.id}>
                        <td><code className="text-xs">{d.event}</code></td>
                        <td><StatusPill status={d.status} attempts={d.attempts} nextRetryAt={d.nextRetryAt} /></td>
                        <td>{d.attempts}</td>
                        <td className="text-xs">{d.nextRetryAt ? d.nextRetryAt.toLocaleString() : ""}</td>
                        <td className="text-xs">{d.createdAt.toLocaleString()}</td>
                        <td><code className="block max-w-xs truncate text-xs" title={JSON.stringify(d.payload)}>{JSON.stringify(d.payload).slice(0, 80)}</code></td>
                      </tr>
                    ))}</tbody>
                  </table>
                ) : <p className="p-4 text-sm text-neutral-500">Nothing delivered yet. Use Send test to check the endpoint.</p>}
              </div>
              <div className="card p-4 text-xs text-neutral-600">
                <p className="font-semibold text-neutral-800">Verifying deliveries</p>
                <p className="mt-1">Each POST carries <code>X-Pressdesk-Event</code>, <code>X-Pressdesk-Delivery</code> and <code>X-Pressdesk-Signature: sha256=&lt;hex&gt;</code>, the HMAC-SHA256 of the raw JSON body with your secret. Body: <code>{`{ id, event, createdAt, data }`}</code>. Non-2xx responses are retried after 1m, 5m, 30m, 2h and 12h.</p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
