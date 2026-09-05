import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";

import { engagementIn, hygienePct } from "@/lib/lists";

export default async function ListsPage() {
  const v = await requireViewer();
  const since = new Date(Date.now() - 90 * 864e5);
  const lists = await db.list.findMany({
    where: { accountId: v.account.id, deletedAt: null, OR: [{ visibility: "SHARED" }, { ownerId: v.user.id }] },
    include: { members: { include: { contact: { select: { email: true, emailStatus: true } } } }, distributions: { where: { isTest: false, createdAt: { gte: since } }, include: { release: { select: { headline: true } }, recipients: { select: { firstOpenAt: true, repliedAt: true, deliveredAt: true } } }, orderBy: { createdAt: "desc" } } },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h1 className="text-xl font-semibold">Lists</h1><Link href="/lists/new" className="btn btn-primary">New list</Link></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {lists.map((l: any) => {
          const h = hygienePct(l.members);
          const last = l.distributions[0];
          const eng = engagementIn(l.distributions.flatMap((d: any) => d.recipients));
          return (
            <Link key={l.id} href={`/lists/${l.id}`} className="card block p-4 hover:border-accent">
              <div className="flex items-start justify-between"><h2 className="font-semibold">{l.name}</h2>{l.isSmart && <span className="pill bg-accentSoft text-accent" title="Smart Group (auto updates)">⟳ smart</span>}</div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div><div className={`text-lg font-semibold ${h >= 90 ? "text-good" : h >= 70 ? "text-warn" : "text-bad"}`}>{h}%</div>Hygiene</div>
                <div><div className="text-lg font-semibold">{eng}</div>Engagement In</div>
                <div><div className="text-lg font-semibold">{l.isSmart ? "auto" : l.members.length}</div>Members</div>
              </div>
              <p className="mt-3 truncate text-xs text-neutral-500">{last ? `Last sent: ${last.release.headline} · ${last.createdAt.toLocaleDateString()}` : "Nothing sent yet"}</p>
            </Link>
          );
        })}
      </div>
      {!lists.length && <div className="card p-10 text-center text-sm text-neutral-600">No lists yet. Build one from selected contacts, or save a filter as a Smart Group.</div>}
      <Link href="/lists/new" className="fixed bottom-6 right-6 grid h-12 w-12 place-items-center rounded-full bg-accent text-2xl text-white shadow-lg" aria-label="New list">+</Link>
    </div>
  );
}
