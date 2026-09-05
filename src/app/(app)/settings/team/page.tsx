import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { inviteTeammate } from "@/server/auth";
import { limitsFor } from "@/lib/plans";
import { changeRole, deactivateMember } from "@/server/team";

export default async function Team({ searchParams }: { searchParams: { q?: string } }) {
  const v = await requireViewer();
  const members = await db.membership.findMany({ where: { accountId: v.account.id }, include: { user: true }, orderBy: { createdAt: "asc" } });
  const q = (searchParams.q ?? "").toLowerCase();
  const shown = members.filter((m: any) => !q || m.user.name.toLowerCase().includes(q) || m.user.email.includes(q));
  const canAdmin = v.role === "OWNER" || v.role === "ADMIN";
  const limit = limitsFor(v.account.plan).users;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h1 className="text-xl font-semibold">Team Management</h1><span className="text-xs text-neutral-500">{members.filter((m: any) => !m.deactivatedAt).length} of {limit} seats</span></div>
      <form className="mb-3 max-w-sm"><input name="q" className="input" defaultValue={searchParams.q ?? ""} placeholder="Search teammates" /></form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((m: any) => {
          const online = m.user.lastSignInAt && Date.now() - m.user.lastSignInAt.getTime() < 15 * 6e4;
          return (
            <div key={m.id} className={`card p-4 ${m.deactivatedAt ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-accentSoft text-sm font-semibold text-accent">{m.user.name.split(" ").map((s: string) => s[0]).join("").slice(0, 2)}</span>
                <div className="min-w-0"><p className="truncate font-medium">{m.user.name} {(m.role === "OWNER" || m.role === "ADMIN") && <span title="Admin">⚡</span>}</p><p className="truncate text-xs text-neutral-500">{m.jobTitle ?? m.role.toLowerCase()} · {v.account.name}</p></div>
              </div>
              <p className="mt-2 text-xs text-neutral-500">{online ? <span className="text-good">● Online</span> : `Last login ${m.user.lastSignInAt?.toLocaleString() ?? "never"}`}</p>
              <p className="mt-1 text-xs"><a href={`mailto:${m.user.email}`} className="underline">✉ {m.user.email}</a></p>
              {canAdmin && !m.deactivatedAt && m.userId !== v.user.id && (
                <div className="mt-3 flex gap-2">
                  <form action={changeRole.bind(null, m.id)}><select name="role" defaultValue={m.role} className="input w-28" aria-label="Role"><option>VIEWER</option><option>EDITOR</option><option>ADMIN</option>{v.role === "OWNER" && <option>OWNER</option>}</select><button className="btn ml-1">Set</button></form>
                  <form action={deactivateMember.bind(null, m.id)}><button className="btn btn-danger">Deactivate</button></form>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {canAdmin && (
        <form action={inviteTeammate} className="card mt-4 flex max-w-lg flex-wrap items-end gap-2 p-4">
          <div className="flex-1"><label className="label">Invite by email</label><input name="email" type="email" className="input" required /></div>
          <div><label className="label">Role</label><select name="role" className="input"><option>EDITOR</option><option>VIEWER</option><option>ADMIN</option></select></div>
          <button className="btn btn-primary">Send invite</button>
        </form>
      )}
    </div>
  );
}
