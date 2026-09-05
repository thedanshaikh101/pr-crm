"use client";
import { useFormState } from "react-dom";
import { completeReset, requestReset } from "@/server/auth";

export function ResetForm({ t }: { t: string | null }) {
  const [r, req] = useFormState(requestReset, null as any);
  const [c, done] = useFormState(completeReset, null as any);
  if (t) return (
    <form action={done} className="card space-y-3 p-6">
      <h1 className="text-lg font-semibold">Choose a new password</h1>
      <input type="hidden" name="t" value={t} />
      <input className="input" name="password" type="password" minLength={10} required autoComplete="new-password" placeholder="New password" />
      {c?.error && <p className="text-sm text-bad">{c.error}</p>}
      <button className="btn btn-primary w-full justify-center">Save password</button>
    </form>
  );
  return (
    <form action={req} className="card space-y-3 p-6">
      <h1 className="text-lg font-semibold">Reset your password</h1>
      <input className="input" name="email" type="email" required placeholder="you@agency.com" />
      {r?.ok && <p className="text-sm text-good">{r.ok}</p>}
      {r?.error && <p className="text-sm text-bad">{r.error}</p>}
      <button className="btn btn-primary w-full justify-center">Send reset link</button>
    </form>
  );
}
