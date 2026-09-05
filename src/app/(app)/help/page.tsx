import Link from "next/link";

const SECTIONS: { title: string; items: { label: string; href: string; text: string }[] }[] = [
  { title: "Getting started", items: [
    { label: "Import your media list", href: "/contacts/imports/new", text: "CSV, XLSX, pasted rows or a shared Google Sheet. Headers from Onclusive and Canadian Press exports map automatically." },
    { label: "Verify a sending domain", href: "/settings/domains", text: "Add the DNS records shown, then verify. Live distributions only send from verified domains." },
    { label: "Invite your team", href: "/settings/team", text: "Owners and admins manage billing and settings, editors write and send, viewers read." },
    { label: "Set up your newsroom", href: "/settings/newsroom", text: "Logo, colours, media contact block, about page and an optional custom domain." },
  ] },
  { title: "Daily work", items: [
    { label: "Contacts", href: "/contacts", text: "Filter by outlet, subject, classification, location and engagement. Save views. Build lists and smart groups." },
    { label: "Press releases", href: "/releases", text: "Write, preview for Gmail, Outlook and mobile, distribute to lists with tracking, and see who opened, clicked and replied." },
    { label: "Coverage", href: "/coverage", text: "Paste a URL to log a hit. Link it to a release and a client. Export CSV or a PDF report per client." },
    { label: "Response Desk", href: "/response-desk", text: "Track enquiries, deadlines, interview requests and approved statements in one place." },
    { label: "Planning", href: "/planning/calendar", text: "Calendar of releases, embargoes and awareness days, charts, and per-teammate reports." },
  ] },
  { title: "Integrations", items: [
    { label: "API keys and webhooks", href: "/settings/api", text: "REST API for contacts, lists, releases and coverage. Webhooks for published releases, completed distributions and new coverage." },
    { label: "OpenAPI specification", href: "/api/v1/openapi.json", text: "Machine-readable description of every endpoint and webhook payload." },
    { label: "Billing", href: "/settings/billing", text: "Plans, usage meters, invoices and cancellation." },
  ] },
];

export default function Help() {
  return (
    <div className="max-w-3xl space-y-6">
      <div><h1 className="text-xl font-semibold">Help</h1><p className="mt-1 text-sm text-neutral-600">Short guides for every module. Press <kbd className="rounded border border-line bg-white px-1 text-xs">⌘K</kbd> anywhere to search contacts, organizations, lists, releases and coverage.</p></div>
      {SECTIONS.map((s) => (
        <section key={s.title} className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">{s.title}</h2>
          <ul className="divide-y divide-line">{s.items.map((i) => <li key={i.href} className="py-2 text-sm"><Link href={i.href} className="font-medium hover:underline">{i.label}</Link><p className="text-neutral-600">{i.text}</p></li>)}</ul>
        </section>
      ))}
      <section className="card p-4 text-sm">
        <h2 className="mb-2 text-sm font-semibold">Keyboard</h2>
        <ul className="grid gap-1 sm:grid-cols-2 text-neutral-700">
          <li><kbd className="rounded border border-line bg-white px-1 text-xs">⌘K</kbd> Global search</li>
          <li><kbd className="rounded border border-line bg-white px-1 text-xs">Esc</kbd> Close any drawer or dialog</li>
          <li><kbd className="rounded border border-line bg-white px-1 text-xs">↑ ↓</kbd> Move between rows in the contacts table</li>
          <li><kbd className="rounded border border-line bg-white px-1 text-xs">Enter</kbd> Open the focused row, <kbd className="rounded border border-line bg-white px-1 text-xs">Space</kbd> select it</li>
        </ul>
      </section>
      <p className="text-xs text-neutral-500">Deployment and operations notes live in <code>docs/DEPLOY.md</code> in the repository.</p>
    </div>
  );
}
