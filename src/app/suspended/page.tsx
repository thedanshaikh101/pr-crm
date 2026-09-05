import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { logout } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function Suspended() {
  const v = await getViewer();
  const a = v ? await db.account.findUnique({ where: { id: v.account.id }, select: { name: true, suspendedAt: true, suspendedReason: true } }) : null;
  const trial = a?.suspendedReason === "trial_expired";
  const support = `mailto:support@${new URL(process.env.APP_URL ?? "http://localhost:3000").hostname}?subject=${encodeURIComponent(`Suspended workspace: ${a?.name ?? ""}`)}`;
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div className="card max-w-md p-8">
        <p className="mb-2 text-2xl font-semibold tracking-tight">Pressdesk</p>
        {trial ? (
          <>
            <h1 className="text-xl font-semibold">Your trial has ended</h1>
            <p className="mt-2 text-sm text-neutral-600">{a?.name ? `${a.name} is paused. ` : ""}Your data is safe. Choose a plan to pick up where you left off.</p>
            <Link href="/settings/billing" className="btn btn-primary mt-4 justify-center">Choose a plan</Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">This account is suspended</h1>
            <p className="mt-2 text-sm text-neutral-600">{a?.suspendedReason ? `Reason: ${a.suspendedReason.replace(/_/g, " ")}. ` : "Usually a bounce or complaint rate problem. "}Contact support to reinstate it.</p>
            <a href={support} className="btn btn-primary mt-4 justify-center">Email support</a>
          </>
        )}
        {a?.suspendedAt && <p className="mt-3 text-xs text-neutral-500">Suspended {a.suspendedAt.toLocaleString()}</p>}
        <form action={logout} className="mt-6"><button className="btn w-full justify-center">Sign out</button></form>
        {!v && <p className="mt-3 text-xs"><Link href="/login" className="underline">Sign in</Link></p>}
      </div>
    </main>
  );
}
