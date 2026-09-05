"use client";
import Link from "next/link";
import { useFormState } from "react-dom";
import { login, sendMagicLink } from "@/server/auth";
import { GoogleButton } from "./GoogleButton";

export function LoginForm({ googleEnabled, error }: { googleEnabled: boolean; error?: string }) {
  const [s, act] = useFormState(login, null as any);
  const [m, magic] = useFormState(sendMagicLink, null as any);
  return (
    <div className="card p-6">
      <h1 className="mb-4 text-lg font-semibold">Sign in</h1>
      {error === "google" && <p className="mb-3 text-sm text-bad">Google sign-in did not complete. Try again or use your password.</p>}
      <form action={act} className="space-y-3">
        <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" required autoComplete="email" /></div>
        <div><label className="label" htmlFor="password">Password</label><input className="input" id="password" name="password" type="password" required autoComplete="current-password" /></div>
        {s?.error && <p className="text-sm text-bad">{s.error}</p>}
        <button className="btn btn-primary w-full justify-center">Sign in</button>
      </form>
      {googleEnabled && <GoogleButton />}
      <form action={magic} className="mt-4 border-t border-line pt-4">
        <p className="mb-2 text-xs text-neutral-600">Or get a one-time sign-in link by email.</p>
        <div className="flex gap-2"><input className="input" name="email" type="email" placeholder="you@agency.com" required /><button className="btn">Send link</button></div>
        {m?.ok && <p className="mt-2 text-sm text-good">{m.ok}</p>}
        {m?.error && <p className="mt-2 text-sm text-bad">{m.error}</p>}
      </form>
      <p className="mt-4 text-xs text-neutral-600"><Link className="underline" href="/reset">Forgot password</Link> · <Link className="underline" href="/register">Create a workspace</Link></p>
    </div>
  );
}
