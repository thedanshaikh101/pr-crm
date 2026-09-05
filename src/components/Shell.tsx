import Link from "next/link";
import { logout } from "@/server/auth";
import type { Viewer } from "@/lib/auth";
import { NAV } from "./nav";
import { GlobalSearch } from "./GlobalSearch";

function Initials({ name }: { name: string }) {
  const i = name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-xs font-semibold text-white">{i}</span>;
}

export function Shell({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  const trialDaysLeft = viewer.account.trialEndsAt ? Math.max(0, Math.ceil((viewer.account.trialEndsAt.getTime() - Date.now()) / 864e5)) : null;
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-14 flex-col items-center gap-3 bg-rail py-3 text-white">
        <Link href="/dashboard" className="mb-2 grid h-8 w-8 place-items-center rounded bg-white/10 text-sm font-bold" title="Pressdesk">P</Link>
        <Link href="/contacts/new" className="grid h-9 w-9 place-items-center rounded-md bg-accent text-lg" title="Quick add contact" aria-label="Quick add contact">+</Link>
        <div className="flex-1" />
        <Link href="/settings" className="rail-icon" title="Settings" aria-label="Settings">⚙</Link>
        <Link href="/help" className="rail-icon" title="Help" aria-label="Help">?</Link>
        <form action={logout}><button className="rail-icon" title="Log out" aria-label="Log out">⎋</button></form>
        <Link href="/settings/me" title={viewer.user.name}><Initials name={viewer.user.name} /></Link>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-1 border-b border-line bg-white px-3">
          <nav className="flex items-center gap-0.5" aria-label="Modules">
            {NAV.map((m) => (
              <div key={m.label} className="group relative">
                <Link href={m.href} className="rounded px-2.5 py-1.5 text-sm font-medium hover:bg-neutral-100">{m.label}{m.items ? " ▾" : ""}</Link>
                {m.items && (
                  <div className="invisible absolute left-0 top-full z-30 min-w-[13rem] rounded-md border border-line bg-white py-1 shadow-lg group-hover:visible group-focus-within:visible">
                    {m.items.map((i) => (
                      <Link key={i.href} href={i.href} target={i.external ? "_blank" : undefined} className="block px-3 py-1.5 text-sm hover:bg-neutral-100">{i.label}{i.external ? " ↗" : ""}</Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
          <div className="flex-1" />
          {trialDaysLeft !== null && viewer.account.plan === "TRIAL" && (
            <Link href="/settings/billing" className="mr-2 text-xs text-warn">Trial: {trialDaysLeft} days left</Link>
          )}
          {viewer.session.impersonatedBy && <span className="mr-2 rounded bg-bad px-2 py-0.5 text-xs text-white">Impersonating {viewer.account.name}</span>}
          <span className="mr-2 hidden text-xs text-neutral-500 md:inline">{viewer.account.name}</span>
          <GlobalSearch />
        </header>
        <main className="min-w-0 flex-1 p-5">{children}</main>
      </div>
    </div>
  );
}
