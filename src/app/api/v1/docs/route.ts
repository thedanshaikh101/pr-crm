import { buildOpenApi, listOperations, SIGNATURE_HEADER, WEBHOOK_EVENTS } from "@/lib/api/openapi";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// GET /api/v1/docs  (public): a plain server-rendered listing of the API, no external scripts.
export async function GET() {
  const doc = buildOpenApi();
  const ops = listOperations(doc);
  const tags = Array.from(new Set(ops.map((o) => o.tag)));
  const rows = tags.map((t) => `<h2>${esc(t)}</h2><table><thead><tr><th>Method</th><th>Path</th><th>Summary</th><th>Query</th><th>Auth</th></tr></thead><tbody>${ops.filter((o) => o.tag === t).map((o) => `<tr><td><code class="m ${o.method.toLowerCase()}">${o.method}</code></td><td><code>${esc(o.path)}</code></td><td>${esc(o.summary)}</td><td>${o.params.map((p) => `<code>${esc(p)}</code>`).join(" ")}</td><td>${o.auth ? "Bearer key" : "none"}</td></tr>`).join("")}</tbody></table>`).join("");
  const hooks = Object.entries(doc.webhooks).map(([name, h]) => `<tr><td><code>${esc(name)}</code></td><td>${esc(h.post.description ?? "")}</td></tr>`).join("");
  const schemas = Object.keys(doc.components.schemas).map((s) => `<code>${esc(s)}</code>`).join(", ");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc.info.title)} v${esc(doc.info.version)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:64rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a}h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:1.8rem}table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{text-align:left;padding:.4rem .5rem;border-bottom:1px solid #e5e5e5;vertical-align:top}th{font-size:.8rem;color:#555}code{font:.88em ui-monospace,monospace;background:#f4f4f4;padding:.1em .3em;border-radius:3px}.m{font-weight:600}.get{color:#1f5fbf}.post{color:#2e7d4f}.patch{color:#b8860b}.delete{color:#b3261e}p.note{color:#555;font-size:.92rem}</style></head><body>
<h1>${esc(doc.info.title)} <small>v${esc(doc.info.version)}</small></h1>
<p>${esc(doc.info.description)}</p>
<p class="note">Base URL: <code>${esc(doc.servers[0].url)}</code>. Machine-readable spec: <a href="/api/v1/openapi.json">/api/v1/openapi.json</a> (OpenAPI 3.0). Lists are paginated with <code>page</code> and <code>per</code> (max 250) and return <code>{total, page, per, pages, data}</code>.</p>
${rows}
<h2>Webhooks</h2>
<p class="note">Endpoints configured under Settings receive a POST per event with a JSON body <code>{id, event, createdAt, data}</code> and the header <code>${esc(SIGNATURE_HEADER)}: sha256=&lt;hex HMAC-SHA256 of the raw body using the endpoint secret&gt;</code>. Reply with any 2xx; other responses are retried with backoff up to 5 attempts.</p>
<table><thead><tr><th>Event</th><th>When</th></tr></thead><tbody>${hooks}</tbody></table>
<p class="note">Events: ${WEBHOOK_EVENTS.map((e) => `<code>${esc(e)}</code>`).join(", ")}.</p>
<h2>Schemas</h2><p class="note">${schemas}. Full definitions live in the OpenAPI document under <code>components.schemas</code>.</p>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}
