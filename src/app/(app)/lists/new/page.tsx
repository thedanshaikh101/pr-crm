import { createList, addToList } from "@/server/contacts";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/auth";

export default async function NewList({ searchParams }: { searchParams: { smart?: string; ids?: string; filter?: string } }) {
  const ids = searchParams.ids?.split(",").filter(Boolean) ?? [];
  async function create(fd: FormData) {
    "use server";
    const v = await requireViewer();
    const name = String(fd.get("name") ?? "").trim();
    if (!name) throw new Error("List needs a name");
    const isSmart = fd.get("isSmart") === "on";
    const l = await db.list.create({ data: { accountId: v.account.id, name, description: String(fd.get("description") ?? "") || null, isSmart, smartFilter: isSmart ? { query: String(fd.get("smartFilter") ?? "") } : undefined, ownerId: v.user.id, editedById: v.user.id, visibility: (fd.get("visibility") as any) || "SHARED" } });
    const seed = String(fd.get("ids") ?? "").split(",").filter(Boolean);
    if (seed.length && !isSmart) await addToList(l.id, seed);
    redirect(`/lists/${l.id}`);
  }
  return (
    <form action={create} className="card max-w-lg space-y-3 p-5">
      <h1 className="text-xl font-semibold">New list</h1>
      <input type="hidden" name="ids" value={ids.join(",")} />
      <div><label className="label">Name</label><input name="name" className="input" required /></div>
      <div><label className="label">Description</label><input name="description" className="input" /></div>
      <div><label className="label">Visibility</label><select name="visibility" className="input"><option value="SHARED">Shared with account</option><option value="PRIVATE">Private to me</option></select></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isSmart" defaultChecked={!!searchParams.smart} /> Smart Group (auto updates from a saved filter)</label>
      <div><label className="label">Smart filter (paste the query string from a filtered Contacts URL, e.g. cls=Television&aud=Toronto)</label><input name="smartFilter" className="input" defaultValue={searchParams.filter ?? ""} /></div>
      {ids.length > 0 && <p className="text-xs text-neutral-600">{ids.length} selected contact(s) will be added (fixed lists only).</p>}
      <button className="btn btn-primary">Create list</button>
    </form>
  );
}
