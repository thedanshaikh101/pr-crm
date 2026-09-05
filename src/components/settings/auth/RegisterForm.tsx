"use client";
import Link from "next/link";
import { useFormState } from "react-dom";
import { register } from "@/server/auth";
import { GoogleButton } from "./GoogleButton";

export function RegisterForm({ googleEnabled, invite }: { googleEnabled: boolean; invite?: string }) {
  const [s, act] = useFormState(register, null as any);
  return (
    <div className="card p-6">
      <h1 className="mb-1 text-lg font-semibold">Create your workspace</h1>
      <p className="mb-4 text-xs text-neutral-600">14-day trial. Bring your own contacts; nothing is preloaded.</p>
      <form action={act} className="space-y-3">
        <div><label className="label" htmlFor="workspace">Workspace name</label><input className="input" id="workspace" name="workspace" required placeholder="Changemaker PR" /></div>
        <div><label className="label" htmlFor="name">Your name</label><input className="input" id="name" name="name" required /></div>
        <div><label className="label" htmlFor="email">Work email</label><input className="input" id="email" name="email" type="email" required /></div>
        <div><label className="label" htmlFor="password">Password (10+ characters)</label><input className="input" id="password" name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
        {s?.error && <p className="text-sm text-bad">{s.error}</p>}
        <button className="btn btn-primary w-full justify-center">Create workspace</button>
      </form>
      {googleEnabled && <GoogleButton invite={invite} label="Sign up with Google" />}
      <p className="mt-4 text-xs text-neutral-600">Already have one? <Link className="underline" href="/login">Sign in</Link></p>
    </div>
  );
}
