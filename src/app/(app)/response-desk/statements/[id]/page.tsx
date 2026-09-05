import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { cleanHtml, stripTags } from "@/lib/html";
import { approveStatement, attachAsset, deleteStatement, detachAsset, expireStatement, restoreStatementVersion, statementToDraft, submitStatement, updateStatement } from "@/server/responseDesk";
import { assetOptions, attachmentsFor, nameOf, teammates, topicOptions } from "@/lib/responseDesk/data";
import { statementEffectiveStatus } from "@/lib/responseDesk/statements";
import { StatementForm } from "@/components/responseDesk/StatementForm";
import { ConfirmButton } from "@/components/responseDesk/ConfirmButton";
import { CopyButton } from "@/components/responseDesk/CopyButton";
import { Card, ErrorNote, Row, StatusPill, fmt } from "@/components/responseDesk/ui";

export default async function StatementPage({ params, searchParams }: { params: { id: string }; searchParams: { edit?: string; v?: string; error?: string } }) {
  const v = await requireViewer();
  const a = v.account.id;
  const s = await db.statement.findFirst({ where: { id: params.id, accountId: a }, include: { topic: { select: { id: true, name: true } }, versions: { orderBy: { version: "desc" } } } });
  if (!s) notFound();
  const [topics, team, attachments, assets] = await Promise.all([topicOptions(a), teammates(a), attachmentsFor(a, "statement", s.id), assetOptions(a)]);
  const savers = await db.user.findMany({ where: { id: { in: Array.from(new Set([...s.versions.map((x: any) => x.savedById as string), s.approvedById].filter(Boolean) as string[])) } }, select: { id: true, name: true } });
  const who = nameOf([...team, ...savers.map((u: any) => ({ id: u.id, name: u.name }))]);
  const now = new Date();
  const here = `/response-desk/statements/${s.id}`;
  const effective = statementEffectiveStatus(s, now);
  const canApprove = v.role === "ADMIN" || v.role === "OWNER";
  const viewing = searchParams.v ? s.versions.find((x: any) => x.version === Number(searchParams.v)) : null;
  const bodyHtml = cleanHtml(s.body);
  const plain = stripTags(s.body);

  if (searchParams.edit) return (
    <div>
      <div className="mb-3 flex items-center gap-2"><Link href={here} className="btn">← Back</Link><h1 className="text-xl font-semibold">Edit statement</h1></div>
      {s.status === "APPROVED" && <ErrorNote message="This statement is approved. Changing the text sends it back to draft for a fresh approval." />}
      <StatementForm action={updateStatement.bind(null, s.id)} s={s} topics={topics} submitLabel="Save changes" />
    </div>
  );

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Link href="/response-desk/statements" className="btn">← Statements</Link>
        <h1 className="text-xl font-semibold">{s.title}</h1><StatusPill status={effective} />
        <details className="relative ml-auto"><summary className="btn cursor-pointer list-none">⋯</summary>
          <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border border-line bg-white py-1 text-sm shadow-lg">
            <Link className="block px-3 py-1.5 hover:bg-neutral-50" href={`${here}?edit=1`}>Edit</Link>
            {effective !== "EXPIRED" && <form action={expireStatement.bind(null, s.id)}><button className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50">Mark expired</button></form>}
            <form action={deleteStatement.bind(null, s.id)}><ConfirmButton message="Delete this statement and all its versions?" className="block w-full px-3 py-1.5 text-left text-bad hover:bg-red-50">Delete</ConfirmButton></form>
          </div>
        </details>
      </div>
      <ErrorNote message={searchParams.error} />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {effective === "APPROVED" && (
            <section className="rounded-lg border border-good bg-green-50 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-good">Approved text</h2><span className="text-xs text-neutral-600">by {who(s.approvedById) ?? "Unknown"} · {fmt(s.approvedAt)}{s.expiresAt ? ` · valid until ${fmt(s.expiresAt)}` : ""}</span>
                <span className="ml-auto flex gap-1"><CopyButton text={plain} html={bodyHtml} label="Copy" /><CopyButton text={plain} label="Copy as plain text" /></span></div>
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            </section>
          )}
          {effective === "EXPIRED" && <ErrorNote message={`This statement expired${s.expiresAt ? " on " + fmt(s.expiresAt) : ""}. Update the text and send it for a fresh approval before using it.`} />}

          <div className={viewing ? "grid gap-4 md:grid-cols-2" : ""}>
            <Card title={effective === "APPROVED" ? "Current text" : "Statement text"} right={<Link href={`${here}?edit=1`} className="text-xs underline">Edit</Link>}>
              {plain ? <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: bodyHtml }} /> : <p className="text-sm text-neutral-500">No text yet.</p>}
              {effective !== "APPROVED" && plain && <div className="mt-3 flex gap-1"><CopyButton text={plain} html={bodyHtml} label="Copy" /><CopyButton text={plain} label="Copy as plain text" /></div>}
            </Card>
            {viewing && (
              <Card title={`Version ${viewing.version}`} right={<Link href={here} className="text-xs underline">Close</Link>}>
                <p className="mb-2 text-xs text-neutral-500">Saved by {who(viewing.savedById) ?? "Unknown"} · {fmt(viewing.createdAt)}</p>
                <div className="prose prose-sm max-w-none rounded bg-neutral-50 p-2" dangerouslySetInnerHTML={{ __html: cleanHtml(viewing.body) }} />
                {viewing.body.trim() !== s.body.trim() && <form action={async () => { "use server"; await restoreStatementVersion(s.id, viewing.version); }} className="mt-3"><button className="btn">Restore this version</button></form>}
              </Card>
            )}
          </div>

          <Card title="Approval">
            <div className="flex flex-wrap gap-2 text-sm">
              {s.status === "DRAFT" && <form action={submitStatement.bind(null, s.id)}><button className="btn btn-primary">Submit for review</button></form>}
              {s.status === "IN_REVIEW" && (canApprove
                ? <form action={approveStatement.bind(null, s.id)}><button className="btn btn-primary">Approve</button></form>
                : <span className="text-neutral-600">Waiting for an admin or owner to approve.</span>)}
              {s.status !== "DRAFT" && <form action={statementToDraft.bind(null, s.id)}><button className="btn">Send back to draft</button></form>}
              {(s.status === "APPROVED" || s.status === "IN_REVIEW") && effective !== "EXPIRED" && <form action={expireStatement.bind(null, s.id)}><button className="btn">Mark expired</button></form>}
            </div>
            <p className="mt-2 text-xs text-neutral-500">Draft → In review → Approved. Only owners and admins can approve. Editing approved text returns it to draft.</p>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title="Details">
            <Row k="Status" val={<StatusPill status={effective} />} />
            <Row k="Topic" val={s.topic ? <Link href={`/response-desk/topics/${s.topic.id}`} className="underline">{s.topic.name}</Link> : null} />
            <Row k="Approved by" val={who(s.approvedById)} />
            <Row k="Approved at" val={fmt(s.approvedAt)} />
            <Row k="Expires" val={fmt(s.expiresAt)} />
            <Row k="Updated" val={fmt(s.updatedAt)} />
          </Card>
          <Card title={`Versions (${s.versions.length})`}>
            <ul className="space-y-1 text-sm">{s.versions.map((x: any) => (
              <li key={x.id} className={`flex items-center gap-2 rounded px-2 py-1 ${viewing?.id === x.id ? "bg-accentSoft" : ""}`}>
                <Link href={`${here}?v=${x.version}`} className="font-medium hover:underline">v{x.version}</Link>
                <span className="text-xs text-neutral-500">{who(x.savedById) ?? "Unknown"} · {fmt(x.createdAt)}</span>
                {x.body.trim() === s.body.trim() && <span className="pill ml-auto bg-neutral-100 text-neutral-600">current</span>}
              </li>
            ))}{!s.versions.length && <li className="text-neutral-500">No versions saved.</li>}</ul>
          </Card>
          <Card title={`Attachments (${attachments.length})`}>
            <ul className="mb-2 space-y-1 text-sm">{attachments.map((x) => (
              <li key={x.id} className="flex items-center gap-2">
                {x.href ? <a href={x.href} className="min-w-0 flex-1 truncate underline" target="_blank" rel="noopener noreferrer">{x.asset.name}</a> : <span className="min-w-0 flex-1 truncate">{x.asset.name}</span>}
                <span className="chip">{x.asset.kind}</span>
                <form action={async () => { "use server"; await detachAsset(x.id); }}><button className="text-xs text-neutral-500 hover:text-bad" aria-label={`Remove ${x.asset.name}`}>✕</button></form>
              </li>
            ))}{!attachments.length && <li className="text-neutral-500">Nothing attached.</li>}</ul>
            <form action={attachAsset} className="flex gap-1">
              <input type="hidden" name="entity" value="statement" /><input type="hidden" name="entityId" value={s.id} />
              <select name="assetId" className="input" required defaultValue="" aria-label="Asset from library"><option value="" disabled>{assets.length ? "Attach from library" : "Library is empty"}</option>{assets.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              <button className="btn" disabled={!assets.length}>Attach</button>
            </form>
          </Card>
        </aside>
      </div>
    </div>
  );
}
