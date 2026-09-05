"use client";
import { useState } from "react";

/** Shows a secret once with a copy button. */
export function CopyCallout({ label, value, note }: { label: string; value: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-md border border-warn bg-amber-50 p-3 text-sm" role="status">
      <p className="font-medium">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded bg-white px-2 py-1 text-xs">{value}</code>
        <button type="button" className="btn" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } }}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <p className="mt-1 text-xs text-neutral-600">{note ?? "Copy it now. It is stored hashed and cannot be shown again."}</p>
    </div>
  );
}
