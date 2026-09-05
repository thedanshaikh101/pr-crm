import Link from "next/link";
import { logout, switchAccount } from "@/server/auth";
import type { Viewer } from "@/lib/auth";
import { NAV } from "./nav";
import { GlobalSearch } from "./GlobalSearch";
import { ImpersonationBar } from "./admin/ImpersonationBar";

function Initials({ name }: { name: string }) {
  const i = name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-xs font-semibold text-white">{i}</span>;
}

export function Shell({ viewer, children, banner }: { viewer: Viewer; children: React.ReactNode; banner?: React.ReactNode }) {
  const trialDaysLeft = viewer.account.trialEndsAt ? Math.max(0, Math.ceil((viewer.account.trialEndsAt.getTime() - Date.now()) / 864e5)) : null;
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-14 flex-col items-center gap-3 bg-rail py-3 text-white">
        <Link href="/dashboard" className="mb-2 grid h-8 w-8 place-items-center rounded bg-white/10 text-sm font-bold" title="Pressdesk">P</Link>
        <Link href="/contacts/new" className="grid h-9 w-9 place-items-center rounded-md bg-accent text-lg" title="Quick add contact" aria-label="Quick add contact">+</Link>
        <div className="flex-1" />
        {viewer.user.isSuperAdmin && <Link href="/admin" className="rail-icon" title="Super-admin" aria-label="Super-admin">★</Link>}
        <Link href="/settings" className="rail-icon" title="Settings" aria-label="Settings">⚙</Link>
        <Link href="/help" className="rail-icon" title="Help" aria-label="Help">?</Link>
        <form action={logout}><button className="rail-icon" title="Log out" aria-label="Log out">⎋</button></form>
        <Link href="/settings/me" title={viewer.user.name} aria-label="My settings"><Initials name={viewer.user.name} /></Link>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-1 border-b border-line bg-white px-3">
          <details className="relative md:hidden">
            <summary className="btn cursor-pointer list-none px-2" aria-label="Open navigation">☰</summary>
            <nav className="absolute left-0 top-full z-40 mt-1 max-h-[80vh] w-64 overflow-y-auto rounded-md border border-line bg-white py-1 shadow-lg" aria-label="Modules">
              {NAV.map((m) => (
                <div key={m.label} className="border-b border-line last:border-0">
                  <Link href={m.href} className="block px-3 py-2 text-sm font-semibold hover:bg-neutral-100">{m.label}</Link>
                  {m.items?.map((i) => <Link key={i.href} href={i.href} target={i.external ? "_blank" : undefined} className="block px-5 py-1.5 text-sm hover:bg-neutral-100">{i.label}{i.external ? " ↗" : ""}</Link>)}
                </div>
              ))}
            </nav>
          </details>
          <nav className="hidden items-center gap-0.5 md:flex" aria-label="Modules">
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
          {viewer.memberships.length > 1 ? (
            <details className="relative mr-2 hidden md:block">
              <summary className="cursor-pointer list-none text-xs text-neutral-500 hover:text-ink" aria-label="Switch workspace">{viewer.account.name} ▾</summary>
              <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-md border border-line bg-white py-1 shadow-lg">
                {viewer.memberships.map((m) => (
                  <form key={m.accountId} action={switchAccount.bind(null, m.accountId)}>
                    <button className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-100 ${m.accountId === viewer.account.id ? "font-semibold" : ""}`}>{m.name}<span className="ml-1 text-xs text-neutral-500">{m.role.toLowerCase()}</span></button>
                  </form>
                ))}
              </div>
            </details>
          ) : <span className="mr-2 hidden text-xs text-neutral-500 md:inline">{viewer.account.name}</span>}
          <GlobalSearch />
        </header>
        <ImpersonationBar viewer={viewer} />
        {banner}
        <main className="min-w-0 flex-1 p-3 md:p-5">{children}</main>
      </div>
    </div>
  );
}
