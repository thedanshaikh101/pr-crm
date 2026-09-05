// Mount in Shell when viewer.session.impersonatedBy is set (server component).
import type { Viewer } from "@/lib/auth";
import { exitImpersonation } from "@/server/admin";

export function ImpersonationBar({ viewer }: { viewer: Viewer }) {
  if (!viewer.session.impersonatedBy) return null;
  return (
    <div role="status" className="flex items-center justify-between gap-3 bg-bad px-4 py-1.5 text-sm text-white">
      <span>Viewing <strong>{viewer.account.name}</strong> as super-admin. Changes you make here are real and audited.</span>
      <form action={exitImpersonation}><button className="rounded border border-white/60 px-2 py-0.5 text-xs font-medium hover:bg-white/10">Exit</button></form>
    </div>
  );
}
