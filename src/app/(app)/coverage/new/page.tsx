import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { createCoverage } from "@/server/coverage";
import { AddCoverage } from "@/components/coverage/AddCoverage";
import type { CoverageDefaults } from "@/components/coverage/CoverageForm";
import { loadFormOptions } from "@/lib/coverage/options";

export default async function NewCoveragePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const v = await requireViewer();
  const sp = (k: string) => { const x = searchParams[k]; return Array.isArray(x) ? x[0] : x; };
  const options = await loadFormOptions(v.account.id);
  const prefill: CoverageDefaults = {};
  const releaseId = sp("releaseId");
  if (releaseId) {
    const r = await db.release.findFirst({ where: { id: releaseId, accountId: v.account.id }, select: { id: true, clientId: true } });
    if (r) { prefill.releaseId = r.id; if (r.clientId) prefill.clientId = r.clientId; }
  }
  const contactId = sp("contactId");
  if (contactId) {
    const c = await db.contact.findFirst({ where: { id: contactId, accountId: v.account.id }, select: { id: true, organizationId: true, organization: { select: { name: true } } } });
    if (c) { prefill.contactId = c.id; if (c.organizationId) prefill.organizationId = c.organizationId; if (c.organization) prefill.outletName = c.organization.name; }
  }
  if (sp("headline")) prefill.headline = sp("headline");
  if (sp("url")) prefill.url = sp("url");
  if (sp("clientId")) prefill.clientId = sp("clientId");
  const mode = sp("mode") === "paste" ? "paste" : sp("mode") === "manual" || (prefill.headline && !prefill.url) ? "manual" : "url";

  return (
    <div>
      <div className="mb-3 flex items-center gap-2"><Link href="/coverage" className="btn">← Coverage</Link><h1 className="text-xl font-semibold">Add coverage</h1></div>
      <AddCoverage action={createCoverage} options={options} prefill={prefill} initialMode={mode} />
    </div>
  );
}
