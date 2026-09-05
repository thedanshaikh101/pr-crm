import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { attachAsset, detachAsset } from "@/server/responseDesk";
import { assetHref } from "@/lib/responseDesk/data";
import { resolveEntityTitles } from "@/lib/responseDesk/entityTitles";
import { ATTACHABLE_ENTITIES, entityHref, humanize, truncate } from "@/lib/responseDesk/labels";
import { formatBytes } from "@/lib/library/kinds";
import { AttachAssetForm } from "@/components/responseDesk/AttachAssetForm";
import { EmptyState, FilterSelect, fmt } from "@/components/responseDesk/ui";

export default async function AttachmentsPage({ searchParams }: { searchParams: { entity?: string } }) {
  const v = await requireViewer();
  const a = v.account.id;
  const entity = searchParams.entity && (ATTACHABLE_ENTITIES as readonly string[]).includes(searchParams.entity) ? searchParams.entity : undefined;
  const [rows, topics, conversations, statements, interviews, assets] = await Promise.all([
    db.attachment.findMany({ where: { accountId: a, ...(entity ? { entity } : {}) }, include: { asset: true }, orderBy: { createdAt: "desc" }, take: 500 }),
    db.topic.findMany({ where: { accountId: a }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.conversation.findMany({ where: { accountId: a }, orderBy: { receivedAt: "desc" }, take: 200, select: { id: true, question: true, outletName: true } }),
    db.statement.findMany({ where: { accountId: a }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    db.interviewRequest.findMany({ where: { accountId: a }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, spokesperson: true, outletName: true } }),
    db.asset.findMany({ where: { accountId: a, deletedAt: null }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true, kind: true } }),
  ]);
  const titleOf = await resolveEntityTitles(a, rows.map((r: any) => ({ entity: r.entity, entityId: r.entityId })));
  const withLinks = await Promise.all(rows.map(async (r: any) => ({ ...r, href: await assetHref(r.asset) })));
  const entities = {
    topic: topics.map((t: any) => ({ id: t.id, label: t.name })),
    conversation: conversations.map((c: any) => ({ id: c.id, label: `${c.outletName ? c.outletName + ": " : ""}${truncate(c.question, 60)}` })),
    statement: statements.map((s: any) => ({ id: s.id, label: s.title })),
    interview: interviews.map((i: any) => ({ id: i.id, label: `${i.spokesperson}${i.outletName ? " with " + i.outletName : ""}` })),
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h1 className="text-xl font-semibold">File attachments</h1><Link href="/library" className="btn">Resource Library</Link></div>
      <section className="card mb-4 p-4">
        <h2 className="mb-2 text-sm font-semibold">Attach an asset</h2>
        <AttachAssetForm action={attachAsset} entities={entities} assets={assets.map((x: any) => ({ id: x.id, label: `${x.name} (${x.kind})` }))} defaultEntity={entity ?? "conversation"} />
      </section>
      <form method="get" className="mb-3 flex gap-2"><FilterSelect name="entity" value={entity} all="Attached to anything" options={ATTACHABLE_ENTITIES.map((e) => ({ value: e, label: humanize(e) }))} /><button className="btn">Apply</button></form>
      {withLinks.length ? (
        <div className="card overflow-x-auto"><table className="data"><thead><tr><th>Asset</th><th>Kind</th><th>Size</th><th>Attached to</th><th>Added</th><th></th></tr></thead>
          <tbody>{withLinks.map((r: any) => {
            const href = entityHref(r.entity, r.entityId);
            return (
              <tr key={r.id}>
                <td>{r.href ? <a href={r.href} className="font-medium underline" target="_blank" rel="noopener noreferrer">{r.asset.name}</a> : <span className="font-medium">{r.asset.name}</span>}{r.asset.deletedAt && <span className="pill ml-1 bg-red-50 text-bad">deleted</span>}</td>
                <td className="text-xs">{r.asset.kind}</td>
                <td className="text-xs">{r.asset.size ? formatBytes(r.asset.size) : ""}</td>
                <td className="text-xs"><span className="chip mr-1">{humanize(r.entity)}</span>{href ? <Link href={href} className="hover:underline">{titleOf(r.entity, r.entityId) ?? r.entityId}</Link> : r.entityId}</td>
                <td className="whitespace-nowrap text-xs text-neutral-600">{fmt(r.createdAt)}</td>
                <td><form action={async () => { "use server"; await detachAsset(r.id); }}><button className="text-xs text-neutral-500 hover:text-bad" aria-label={`Remove ${r.asset.name}`}>Remove</button></form></td>
              </tr>
            );
          })}</tbody></table></div>
      ) : <EmptyState title={entity ? "Nothing attached to that kind of record." : "No attachments yet."} hint="Attach library assets to conversations, statements, topics and interview requests so the right file is one click away." />}
    </div>
  );
}
