import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { createTheme, deleteTheme, updateTheme } from "@/server/responseDesk";
import { ConfirmButton } from "@/components/responseDesk/ConfirmButton";
import { EmptyState, ErrorNote } from "@/components/responseDesk/ui";

export default async function ThemesPage({ searchParams }: { searchParams: { error?: string; edit?: string } }) {
  const v = await requireViewer();
  const themes = await db.theme.findMany({ where: { accountId: v.account.id }, orderBy: { name: "asc" }, include: { _count: { select: { topics: true } } } });
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h1 className="text-xl font-semibold">Themes</h1></div>
      <ErrorNote message={searchParams.error} />
      <form action={createTheme} className="card mb-4 flex flex-wrap items-end gap-2 p-4">
        <div className="min-w-[14rem] flex-1"><label className="label" htmlFor="th-name">New theme</label><input id="th-name" name="name" className="input" required placeholder="Reputation, Product, Community" /></div>
        <div><label className="label" htmlFor="th-color">Colour</label><input id="th-color" type="color" name="color" defaultValue="#1F5FBF" className="h-9 w-14 cursor-pointer rounded border border-line" /></div>
        <button className="btn btn-primary">Add theme</button>
      </form>
      {themes.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{themes.map((t: any) => (
          <section key={t.id} className="card p-4" style={{ borderTopColor: t.color, borderTopWidth: 4 }}>
            {searchParams.edit === t.id ? (
              <form action={updateTheme.bind(null, t.id)} className="space-y-2">
                <input name="name" className="input" defaultValue={t.name} required aria-label="Theme name" />
                <div className="flex items-center gap-2"><input type="color" name="color" defaultValue={t.color} className="h-9 w-14 cursor-pointer rounded border border-line" aria-label="Theme colour" /><button className="btn btn-primary">Save</button><Link href="/response-desk/themes" className="btn">Cancel</Link></div>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ background: t.color }} /><h2 className="font-semibold">{t.name}</h2><span className="ml-auto text-xs text-neutral-500">{t.color}</span></div>
                <p className="mt-1 text-sm text-neutral-600"><Link href={`/response-desk/topics?theme=${t.id}`} className="hover:underline">{t._count.topics} topic{t._count.topics === 1 ? "" : "s"}</Link></p>
                <div className="mt-3 flex gap-2 text-xs">
                  <Link href={`/response-desk/themes?edit=${t.id}`} className="btn">Rename or recolour</Link>
                  {t._count.topics ? <span className="self-center text-neutral-500">In use, cannot delete</span> : <form action={deleteTheme.bind(null, t.id)}><ConfirmButton message={`Delete theme "${t.name}"?`}>Delete</ConfirmButton></form>}
                </div>
              </>
            )}
          </section>
        ))}</div>
      ) : <EmptyState title="No themes yet." hint="Themes colour-code topics so the desk can see at a glance which area an issue belongs to." />}
    </div>
  );
}
