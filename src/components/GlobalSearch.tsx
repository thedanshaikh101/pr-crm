"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFocusTrap } from "./useFocusTrap";

type Hit = { kind: string; id: string; title: string; sub?: string; href: string };

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const close = useCallback(() => setOpen(false), []);
  useFocusTrap(dialogRef, open, close);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpen(true); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (r.ok) { setHits(await r.json()); setActive(0); }
    }, 150);
    return () => clearTimeout(t);
  }, [q]);
  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && hits[active]) { e.preventDefault(); setOpen(false); router.push(hits[active].href); }
  };
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)} aria-label="Search everything" aria-haspopup="dialog" aria-expanded={open}>🔍 <span className="hidden text-xs text-neutral-500 md:inline">⌘K</span></button>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={close}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="global-search-heading" className="mx-auto mt-24 w-full max-w-xl rounded-lg border border-line bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 id="global-search-heading" className="sr-only">Search everything</h2>
            <div className="flex items-center border-b border-line">
              <input data-autofocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onInputKey} className="w-full px-4 py-3 text-sm outline-none" placeholder="Search contacts, organizations, lists, releases, coverage" aria-label="Search" role="combobox" aria-expanded={hits.length > 0} aria-controls="global-search-results" aria-activedescendant={hits[active] ? `gs-${hits[active].kind}-${hits[active].id}` : undefined} autoComplete="off" />
              <button className="mr-2 rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100" onClick={close} aria-label="Close search">Esc</button>
            </div>
            <ul id="global-search-results" role="listbox" className="max-h-80 overflow-auto py-1">
              {hits.map((h, i) => (
                <li key={h.kind + h.id} id={`gs-${h.kind}-${h.id}`} role="option" aria-selected={i === active}>
                  <Link href={h.href} onClick={close} onMouseEnter={() => setActive(i)} className={`flex items-center gap-3 px-4 py-2 text-sm hover:bg-neutral-50 ${i === active ? "bg-neutral-50" : ""}`}><span className="w-24 text-xs text-neutral-500">{h.kind}</span><span className="font-medium">{h.title}</span><span className="text-neutral-500">{h.sub}</span></Link>
                </li>
              ))}
              {q && !hits.length && <li className="px-4 py-3 text-sm text-neutral-500">Nothing matches yet. Keep typing.</li>}
              {!q && <li className="px-4 py-3 text-xs text-neutral-500">Type to search. Arrow keys move, Enter opens, Escape closes.</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
