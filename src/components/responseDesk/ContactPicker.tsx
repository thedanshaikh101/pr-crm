"use client";
// Typeahead against /api/response-desk/contacts. Stores contactId in a hidden input; fills an empty outletName field on pick.
import { useEffect, useRef, useState } from "react";

type Hit = { id: string; name: string; outlet: string | null; email: string | null };

export function ContactPicker({ name = "contactId", defaultContact, outletField = "outletName", label = "Contact" }: {
  name?: string; defaultContact?: Hit | null; outletField?: string | null; label?: string;
}) {
  const [picked, setPicked] = useState<Hit | null>(defaultContact ?? null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/response-desk/contacts?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        setHits(r.ok ? await r.json() : []);
        setOpen(true);
      } catch { /* aborted */ } finally { setBusy(false); }
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  function choose(h: Hit) {
    setPicked(h); setOpen(false); setQ("");
    if (outletField && h.outlet) {
      const form = inputRef.current?.form;
      const el = form?.elements.namedItem(outletField) as HTMLInputElement | null;
      if (el && !el.value) el.value = h.outlet;
    }
  }

  return (
    <div className="relative">
      <label className="label" htmlFor={`${name}-search`}>{label}</label>
      <input type="hidden" name={name} value={picked?.id ?? ""} />
      {picked ? (
        <div className="flex items-center gap-2 rounded-md border border-line bg-neutral-50 px-2.5 py-1.5 text-sm">
          <span className="min-w-0 flex-1 truncate"><span className="font-medium">{picked.name}</span>{picked.outlet && <span className="text-neutral-500"> · {picked.outlet}</span>}{picked.email && <span className="text-neutral-400"> · {picked.email}</span>}</span>
          <button type="button" className="text-xs text-neutral-500 hover:text-bad" onClick={() => setPicked(null)} aria-label="Clear contact">✕</button>
        </div>
      ) : (
        <input ref={inputRef} id={`${name}-search`} className="input" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Type a name, outlet or email" autoComplete="off" role="combobox" aria-expanded={open} aria-controls={`${name}-list`} />
      )}
      {!picked && open && (
        <ul id={`${name}-list`} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-white py-1 text-sm shadow-lg">
          {busy && !hits.length && <li className="px-3 py-1.5 text-neutral-500">Searching</li>}
          {!busy && !hits.length && <li className="px-3 py-1.5 text-neutral-500">No contacts match. Leave this empty and type the outlet name instead.</li>}
          {hits.map((h) => (
            <li key={h.id} role="option" aria-selected={false}>
              <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(h)}>
                <span className="font-medium">{h.name}</span>{h.outlet && <span className="text-neutral-500"> · {h.outlet}</span>}{h.email && <span className="block text-xs text-neutral-400">{h.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
