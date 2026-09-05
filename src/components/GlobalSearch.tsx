"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Hit = { kind: string; id: string; title: string; sub?: string; href: string };

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpen(true); setTimeout(() => ref.current?.focus(), 0); } if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (r.ok) setHits(await r.json());
    }, 150);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <>
      <button className="btn" onClick={() => { setOpen(true); setTimeout(() => ref.current?.focus(), 0); }} aria-label="Search everything">🔍 <span className="hidden text-xs text-neutral-500 md:inline">⌘K</span></button>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)}>
          <div className="mx-auto mt-24 w-full max-w-xl rounded-lg border border-line bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} className="w-full border-b border-line px-4 py-3 text-sm outline-none" placeholder="Search contacts, organizations, lists, releases, coverage" />
            <ul className="max-h-80 overflow-auto py-1">
              {hits.map((h) => (
                <li key={h.kind + h.id}><Link href={h.href} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-neutral-50"><span className="w-24 text-xs text-neutral-500">{h.kind}</span><span className="font-medium">{h.title}</span><span className="text-neutral-500">{h.sub}</span></Link></li>
              ))}
              {q && !hits.length && <li className="px-4 py-3 text-sm text-neutral-500">Nothing matches yet. Keep typing.</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
