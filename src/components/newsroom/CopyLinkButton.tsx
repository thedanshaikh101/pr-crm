"use client";
import { useState } from "react";

export function CopyLinkButton({ url, label = "Copy link", className = "btn" }: { url: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={className} onClick={async () => { try { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 1500); } catch { window.prompt("Copy this link", url); } }}>
      {done ? "Copied" : label}
    </button>
  );
}

export function PrintButton({ className = "btn" }: { className?: string }) {
  return <button type="button" className={className} onClick={() => window.print()}>Print this page</button>;
}
