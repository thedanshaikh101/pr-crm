import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildContactWhere, parseFilters } from "@/lib/contacts/filters";
import { basePath, type Kind } from "@/lib/releases/data";
import { DistributeForm } from "./DistributeForm";
import { StatusPill } from "./StatusPill";

export async function DistributePage({ kind, id }: { kind: Kind; id: string }) {
  const v = await requireViewer();
  const r = await db.release.findFirst({ where: { id, accountId: v.account.id, deletedAt: null }, select: { id: true, headline: true, status: true, proactivity: true } });
  if (!r) notFound();
  const [lists, domains, lastDist] = await Promise.all([
    db.list.findMany({ where: { accountId: v.account.id, deletedAt: null, OR: [{ visibility: "SHARED" }, { ownerId: v.user.id }] }, select: { id: true, name: true, isSmart: true, smartFilter: true, _count: { select: { members: true } } }, orderBy: { name: "asc" } }),
    db.sendingDomain.findMany({ where: { accountId: v.account.id, status: "VERIFIED" }, select: { domain: true, defaultFrom: true } }),
    db.distribution.findFirst({ where: { accountId: v.account.id, isTest: false }, orderBy: { createdAt: "desc" }, select: { fromName: true, fromEmail: true, replyTo: true } }),
  ]);
  const listOpts = [] as { id: string; name: string; isSmart: boolean; count: number }[];
  for (const l of lists as any[]) {
    const count = l.isSmart ? await db.contact.count({ where: buildContactWhere(parseFilters(Object.fromEntries(new URLSearchParams((l.smartFilter as any)?.query ?? ""))), v.account.id, v.user.id) }) : l._count.members;
    listOpts.push({ id: l.id, name: l.name, isSmart: l.isSmart, count });
  }
  const fromOptions = Array.from(new Set(domains.map((d: any) => d.defaultFrom).filter(Boolean))) as string[];
  const base = basePath(kind);
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Link href={`${base}/${id}`} className="btn">← Back</Link>
        <h1 className="text-xl font-semibold">Distribute: {r.headline}</h1>
        <StatusPill status={r.status} />
      </div>
      {!domains.length && <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-warn">Live sends need a verified sending domain. <Link href="/settings/domains" className="underline">Add and verify one</Link> first.</p>}
      <DistributeForm
        releaseId={id} headline={r.headline} lists={listOpts} fromOptions={fromOptions}
        defaults={{ fromName: lastDist?.fromName ?? v.user.name, fromEmail: lastDist?.fromEmail && fromOptions.includes(lastDist.fromEmail) ? lastDist.fromEmail : fromOptions[0] ?? "", replyTo: lastDist?.replyTo ?? v.user.email, proactivity: r.proactivity }}
        timezone={v.account.timezone} base={base} viewerEmail={v.user.email} hasVerifiedDomain={domains.length > 0}
      />
    </div>
  );
}
