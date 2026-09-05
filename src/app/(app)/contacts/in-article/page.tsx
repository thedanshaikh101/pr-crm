import Link from "next/link";
import { inArticleSearch } from "@/server/contacts";

export default async function InArticle({ searchParams }: { searchParams: { q?: string } }) {
  const r = searchParams.q ? await inArticleSearch(searchParams.q) : null;
  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold">In-Article Search</h1>
      <p className="mb-3 text-sm text-neutral-600">Paste an article URL or headline. We pull the byline and outlet and check whether that journalist is already in your contacts.</p>
      <form className="mb-4 flex gap-2"><input name="q" className="input" defaultValue={searchParams.q ?? ""} placeholder="https://www.cbc.ca/news/…" /><button className="btn btn-primary">Look up</button></form>
      {r && (
        <div className="card space-y-2 p-4 text-sm">
          <p><span className="text-neutral-500">Headline:</span> {r.title ?? "—"}</p>
          <p><span className="text-neutral-500">Byline:</span> {r.byline ?? "Not found on the page"}</p>
          <p><span className="text-neutral-500">Outlet:</span> {r.outlet ?? "—"}</p>
          {r.matches.length > 0 ? (
            <div><p className="font-medium">Already in your contacts:</p>{r.matches.map((m: { id: string; name: string; outlet: string | null }) => <Link key={m.id} href={`/contacts/${m.id}`} className="block underline">{m.name} {m.outlet ? `(${m.outlet})` : ""}</Link>)}</div>
          ) : r.byline ? (
            <Link href={`/contacts/new?firstName=${encodeURIComponent(r.byline.split(" ")[0])}&lastName=${encodeURIComponent(r.byline.split(" ").slice(1).join(" "))}&outlet=${encodeURIComponent(r.outlet ?? "")}&authorPage=${encodeURIComponent(r.url ?? "")}`} className="btn btn-primary">Create {r.byline} as a new contact</Link>
          ) : <p className="text-neutral-500">No byline detected. Add the contact manually.</p>}
        </div>
      )}
    </div>
  );
}
