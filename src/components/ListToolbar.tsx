"use client";
import { useCallback, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveColumnLayout, saveView } from "@/server/views";
import { useFocusTrap } from "./useFocusTrap";

type Col = { key: string; label: string; visible: boolean; width?: number };

export function rememberView(screen: string, view: "table" | "cards") {
  try { localStorage.setItem(`pd:view:${screen}`, view); } catch { /* private mode */ }
}

export function ListToolbar(props: {
  screen: string;
  q: string;
  filterCount: number;
  view: "table" | "cards";
  total: number; from: number; to: number; page: number; pages: number; per: number;
  hrefFor: (patch: Record<string, unknown>) => string;
  resetHref: string;
  columns?: Col[];
  savedViews?: { id: string; name: string; params: string }[];
  currentQuery: string;
  drawer: React.ReactNode;
}) {
  const { hrefFor } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cols, setCols] = useState(false);
  const [q, setQ] = useState(props.q);
  const [, start] = useTransition();
  const [localCols, setLocalCols] = useState(props.columns ?? []);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const closeCols = useCallback(() => setCols(false), []);
  useFocusTrap(drawerRef, open, close);
  useFocusTrap(colsRef, cols, closeCols);

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= localCols.length || to >= localCols.length) return;
    const n = [...localCols]; const [item] = n.splice(from, 1); n.splice(to, 0, item); setLocalCols(n);
  };
  const dropOn = (key: string) => {
    if (!dragKey || dragKey === key) { setDragKey(null); setOverKey(null); return; }
    move(localCols.findIndex((c) => c.key === dragKey), localCols.findIndex((c) => c.key === key));
    setDragKey(null); setOverKey(null);
  };

  return (
    <div className="mb-2">
      <div className="flex flex-wrap items-center gap-2">
        <form className="basis-full sm:basis-auto sm:flex-1 sm:min-w-[16rem]" onSubmit={(e) => { e.preventDefault(); router.push(hrefFor({ q, page: 1 })); }} role="search">
          <input aria-label="Search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, outlet, email, title" />
        </form>
        {props.columns && (
          <div className="relative">
            <button className="btn" onClick={() => setCols(!cols)} aria-label="Columns and saved views" title="Columns and saved views" aria-expanded={cols} aria-haspopup="dialog">☑</button>
            {cols && (
              <div ref={colsRef} role="dialog" aria-modal="true" aria-labelledby="columns-heading" className="absolute right-0 z-30 mt-1 w-72 rounded-md border border-line bg-white p-3 shadow-lg">
                <div className="mb-1 flex items-center justify-between"><p id="columns-heading" className="text-xs font-semibold text-neutral-600">Columns</p><button type="button" className="text-xs text-neutral-500 hover:text-ink" onClick={closeCols} aria-label="Close columns">✕</button></div>
                <p className="mb-1 text-[11px] text-neutral-500">Drag to reorder, or use the arrows.</p>
                <ul>
                  {localCols.map((c, i) => (
                    <li key={c.key}
                      draggable
                      onDragStart={(e) => { setDragKey(c.key); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.key); }}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overKey !== c.key) setOverKey(c.key); }}
                      onDragLeave={() => { if (overKey === c.key) setOverKey(null); }}
                      onDrop={(e) => { e.preventDefault(); dropOn(c.key); }}
                      onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                      className={`flex cursor-grab items-center gap-2 rounded px-1 py-0.5 text-sm ${overKey === c.key && dragKey !== c.key ? "bg-accentSoft ring-1 ring-accent" : ""} ${dragKey === c.key ? "opacity-50" : ""}`}
                    >
                      <span aria-hidden="true" className="select-none text-neutral-300">⋮⋮</span>
                      <label className="flex flex-1 items-center gap-2">
                        <input type="checkbox" checked={c.visible} onChange={(e) => { const n = [...localCols]; n[i] = { ...c, visible: e.target.checked }; setLocalCols(n); }} />
                        {c.label}
                      </label>
                      <span className="ml-auto flex gap-1">
                        <button type="button" className="text-xs text-neutral-400 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${c.label} up`}>↑</button>
                        <button type="button" className="text-xs text-neutral-400 disabled:opacity-30" disabled={i === localCols.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${c.label} down`}>↓</button>
                      </span>
                    </li>
                  ))}
                </ul>
                <button className="btn btn-primary mt-2 w-full justify-center" onClick={() => start(async () => { await saveColumnLayout(props.screen, localCols); setCols(false); router.refresh(); })}>Save layout</button>
                {props.savedViews && (
                  <>
                    <p className="mb-1 mt-3 text-xs font-semibold text-neutral-600">Saved views</p>
                    {props.savedViews.map((s) => <Link key={s.id} href={`${props.resetHref}${s.params}`} className="block py-0.5 text-sm hover:underline">{s.name}</Link>)}
                    {!props.savedViews.length && <p className="text-xs text-neutral-500">None yet.</p>}
                    <form className="mt-1 flex gap-1" onSubmit={(e) => { e.preventDefault(); const name = (new FormData(e.currentTarget).get("name") as string).trim(); if (name) start(async () => { await saveView(props.screen, name, props.currentQuery); router.refresh(); }); }}>
                      <input name="name" className="input" placeholder="Save current as…" aria-label="New view name" /><button className="btn">Save</button>
                    </form>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <button className="btn relative" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
          Filter{props.filterCount > 0 && <span className="ml-1 rounded-full bg-accent px-1.5 text-xs text-white">{props.filterCount}</span>}
        </button>
        <Link href={props.resetHref} className="btn" title="Reset table">Reset</Link>
        <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="View">
          <Link href={hrefFor({ view: "table" })} onClick={() => rememberView(props.screen, "table")} className={`px-2.5 py-1.5 text-sm ${props.view === "table" ? "bg-accentSoft text-accent" : "bg-white"}`} aria-label="Table view" aria-current={props.view === "table" ? "true" : undefined}>▤</Link>
          <Link href={hrefFor({ view: "cards" })} onClick={() => rememberView(props.screen, "cards")} className={`px-2.5 py-1.5 text-sm ${props.view === "cards" ? "bg-accentSoft text-accent" : "bg-white"}`} aria-label="Card view" aria-current={props.view === "cards" ? "true" : undefined}>▦</Link>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600">
        <span>Showing {props.from} to {props.to} of {props.total.toLocaleString()}</span>
        <span className="flex items-center gap-1">
          <Link aria-disabled={props.page <= 1} aria-label="Previous page" className={`btn px-2 py-0.5 ${props.page <= 1 ? "pointer-events-none opacity-40" : ""}`} href={hrefFor({ page: props.page - 1 })}>‹</Link>
          <span>Page {props.page} of {props.pages}</span>
          <Link aria-disabled={props.page >= props.pages} aria-label="Next page" className={`btn px-2 py-0.5 ${props.page >= props.pages ? "pointer-events-none opacity-40" : ""}`} href={hrefFor({ page: props.page + 1 })}>›</Link>
        </span>
        <span>
          Per page:{" "}
          {[25, 50, 100, 250].map((n) => <Link key={n} href={hrefFor({ per: n, page: 1 })} className={`mr-1 ${props.per === n ? "font-semibold text-accent" : "underline"}`} aria-current={props.per === n ? "true" : undefined}>{n}</Link>)}
        </span>
      </div>

      {open && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/20" onClick={close} aria-hidden="true" />
          <div ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="filters-heading" className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-line bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="filters-heading" className="text-base font-semibold">Filters</h2>
              <button className="btn" onClick={close} aria-label="Close filters" data-autofocus>✕</button>
            </div>
            {props.drawer}
          </div>
        </div>
      )}
    </div>
  );
}
