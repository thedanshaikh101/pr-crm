import { notFound, redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseBlocks } from "@/lib/releases/blockTypes";
import { basePath, readMediaContactId, RELEASE_INCLUDE, type Kind } from "@/lib/releases/data";
import { utcToLocalInput } from "@/lib/releases/schedule";
import { ReleaseEditor, type EditorInitial } from "./ReleaseEditor";

/** Shared server wrapper for /releases/new, /releases/[id]/edit and the newsletter equivalents. */
export async function ReleaseEditorPage({ kind, id, searchParams }: { kind: Kind; id?: string; searchParams?: Record<string, string | undefined> }) {
  const v = await requireViewer();
  const r = id ? await db.release.findFirst({ where: { id, accountId: v.account.id, deletedAt: null }, include: RELEASE_INCLUDE }) : null;
  if (id && !r) notFound();
  if (r && r.kind !== kind) redirect(`${basePath(r.kind as Kind)}/${id}/edit`);
  const [boilerplates, clients, tags, assets, liveReleases] = await Promise.all([
    db.boilerplate.findMany({ where: { accountId: v.account.id }, select: { id: true, name: true, kind: true, clientId: true }, orderBy: { name: "asc" } }),
    db.client.findMany({ where: { accountId: v.account.id }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    db.tag.findMany({ where: { accountId: v.account.id }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    db.asset.findMany({ where: { accountId: v.account.id, deletedAt: null }, select: { id: true, name: true, kind: true }, orderBy: { name: "asc" }, take: 500 }),
    kind === "NEWSLETTER" ? db.release.findMany({ where: { accountId: v.account.id, kind: "PRESS_RELEASE", status: "LIVE", deletedAt: null }, select: { id: true, headline: true }, orderBy: { publishedAt: "desc" }, take: 100 }) : Promise.resolve([]),
  ]);
  const initial: EditorInitial = {
    headline: r?.headline ?? "", subheadline: r?.subheadline ?? "", datelineCity: r?.datelineCity ?? "", datelineDate: r?.datelineDate ? r.datelineDate.toISOString().slice(0, 10) : "",
    body: r?.body ?? "", blocks: parseBlocks(r?.blocks), boilerplateId: r?.boilerplateId ?? "", footerId: r?.footerId ?? "", mediaContactId: readMediaContactId(r?.blocks) ?? "",
    featuredImageUrl: r?.featuredImageUrl ?? "", clientId: r?.clientId ?? "", proactivity: r?.proactivity ?? "UNSET", embargoUntil: r?.embargoUntil ? utcToLocalInput(r.embargoUntil, v.account.timezone) : "",
    slug: r?.slug ?? "", tagIds: (r?.tags ?? []).map((t: any) => t.tagId), assetIds: (r?.attachments ?? []).map((a: any) => a.assetId), status: r?.status ?? "DRAFT",
  };
  const notice = searchParams?.saved ? "Saved. A new version was recorded." : searchParams?.restored ? `Restored version ${searchParams.restored}.` : undefined;
  return <ReleaseEditor kind={kind} releaseId={r?.id ?? null} initial={initial} options={{ boilerplates, clients, tags, assets, liveReleases }} base={basePath(kind)} notice={notice} />;
}
