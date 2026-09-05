"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveColumnLayout, saveView } from "@/server/views";

type Col = { key: string; label: string; visible: boolean };

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

  return (
    <div className="mb-2">
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex-1 min-w-[16rem]" onSubmit={(e) => { e.preventDefault(); router.push(hrefFor({ q, page: 1 })); }}>
          <input aria-label="Search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, outlet, email, title" />
        </form>
        {props.columns && (
          <div className="relative">
            <button className="btn" onClick={() => setCols(!cols)} aria-label="Columns and saved views" title="Columns and saved views">☑</button>
            {cols && (
              <div className="absolute right-0 z-30 mt-1 w-64 rounded-md border border-line bg-white p-3 shadow-lg">
                <p className="mb-1 text-xs font-semibold text-neutral-600">Columns</p>
                {localCols.map((c, i) => (
                  <label key={c.key} className="flex items-center gap-2 py-0.5 text-sm">
                    <input type="checkbox" checked={c.visible} onChange={(e) => { const n = [...localCols]; n[i] = { ...c, visible: e.target.checked }; setLocalCols(n); }} />
                    {c.label}
                    <span className="ml-auto flex gap-1">
                      <button type="button" className="text-xs text-neutral-400" disabled={i === 0} onClick={() => { const n = [...localCols]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setLocalCols(n); }} aria-label={`Move ${c.label} up`}>↑</button>
                      <button type="button" className="text-xs text-neutral-400" disabled={i === localCols.length - 1} onClick={() => { const n = [...localCols]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setLocalCols(n); }} aria-label={`Move ${c.label} down`}>↓</button>
                    </span>
                  </label>
                ))}
                <button className="btn btn-primary mt-2 w-full justify-center" onClick={() => start(async () => { await saveColumnLayout(props.screen, localCols); setCols(false); router.refresh(); })}>Save layout</button>
                {props.savedViews && (
                  <>
                    <p className="mb-1 mt-3 text-xs font-semibold text-neutral-600">Saved views</p>
                    {props.savedViews.map((s) => <Link key={s.id} href={`${props.resetHref}${s.params}`} className="block py-0.5 text-sm hover:underline">{s.name}</Link>)}
                    <form className="mt-1 flex gap-1" onSubmit={(e) => { e.preventDefault(); const name = (new FormData(e.currentTarget).get("name") as string).trim(); if (name) start(async () => { await saveView(props.screen, name, props.currentQuery); router.refresh(); }); }}>
                      <input name="name" className="input" placeholder="Save current as…" /><button className="btn">Save</button>
                    </form>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <button className="btn relative" onClick={() => setOpen(true)} aria-haspopup="dialog">
          Filter{props.filterCount > 0 && <span className="ml-1 rounded-full bg-accent px-1.5 text-xs text-white">{props.filterCount}</span>}
        </button>
        <Link href={props.resetHref} className="btn" title="Reset table">Reset</Link>
        <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="View">
          <Link href={hrefFor({ view: "table" })} className={`px-2.5 py-1.5 text-sm ${props.view === "table" ? "bg-accentSoft text-accent" : "bg-white"}`} aria-label="Table view">▤</Link>
          <Link href={hrefFor({ view: "cards" })} className={`px-2.5 py-1.5 text-sm ${props.view === "cards" ? "bg-accentSoft text-accent" : "bg-white"}`} aria-label="Card view">▦</Link>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-neutral-600">
        <span>Showing {props.from} to {props.to} of {props.total.toLocaleString()}</span>
        <span className="flex items-center gap-1">
          <Link aria-disabled={props.page <= 1} className={`btn px-2 py-0.5 ${props.page <= 1 ? "pointer-events-none opacity-40" : ""}`} href={hrefFor({ page: props.page - 1 })}>‹</Link>
          <span>Page {props.page} of {props.pages}</span>
          <Link aria-disabled={props.page >= props.pages} className={`btn px-2 py-0.5 ${props.page >= props.pages ? "pointer-events-none opacity-40" : ""}`} href={hrefFor({ page: props.page + 1 })}>›</Link>
        </span>
        <span>
          Per page:{" "}
          {[25, 50, 100, 250].map((n) => <Link key={n} href={hrefFor({ per: n, page: 1 })} className={`mr-1 ${props.per === n ? "font-semibold text-accent" : "underline"}`}>{n}</Link>)}
        </span>
      </div>

      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-label="Filters">
          <div className="absolute inset-0 bg-black/20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-line bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Filters</h2>
              <button className="btn" onClick={() => setOpen(false)} aria-label="Close filters">✕</button>
            </div>
            {props.drawer}
          </div>
        </div>
      )}
    </div>
  );
}
