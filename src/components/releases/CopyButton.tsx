"use client";
import { useState } from "react";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn px-2 py-0.5 text-xs" aria-label={`${label}: ${value}`} onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { window.prompt("Copy this value", value); } }}>
      {done ? "Copied" : label}
    </button>
  );
}
