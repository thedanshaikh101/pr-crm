import Link from "next/link";
import type { Newsroom } from "@/lib/newsroom/data";
import { listReleases } from "@/lib/newsroom/data";
import { Pager, ReleaseList } from "../ReleaseCard";

export async function NewsroomTagPage({ nr, tag, searchParams }: { nr: Newsroom; tag: string; searchParams: { page?: string } }) {
  const name = decodeURIComponent(tag);
  const page = Math.max(1, Number(searchParams.page) || 1);
  const list = await listReleases(nr.account.id, { tag: name, page });
  const self = `${nr.base}/tag/${encodeURIComponent(name)}`;
  return (
    <div>
      <p className="mb-1 text-sm"><Link href={nr.base || "/"} className="nr-link underline">All news</Link></p>
      <h1 className="mb-4 text-2xl font-bold">Tagged: {name} <span className="text-base font-normal text-neutral-500">({list.total})</span></h1>
      <ReleaseList rows={list.rows} base={nr.base} timeZone={nr.account.timezone} empty="No releases carry this tag yet." />
      <Pager page={list.page} pages={list.pages} hrefFor={(p) => (p > 1 ? `${self}?page=${p}` : self)} />
    </div>
  );
}
