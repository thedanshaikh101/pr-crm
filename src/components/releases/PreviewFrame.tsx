"use client";
import { useState } from "react";

export type PreviewHtml = { email: string; newsroom: string };
type Mode = "email" | "newsroom" | "mobile";
const WIDTHS = [{ label: "Gmail (600px)", w: 600 }, { label: "Outlook (660px)", w: 660 }, { label: "Mobile (375px)", w: 375 }];

/** Sandboxed iframe preview with Email / Newsroom / Mobile toggle and a width selector. */
export function PreviewFrame({ html, loading }: { html: PreviewHtml | null; loading?: boolean }) {
  const [mode, setMode] = useState<Mode>("email");
  const [width, setWidth] = useState(600);
  const w = mode === "mobile" ? 375 : mode === "newsroom" ? Math.max(width, 660) : width;
  const doc = html ? (mode === "newsroom" ? html.newsroom : html.email) : "";
  return (
    <div className="card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="Preview mode">
          {(["email", "newsroom", "mobile"] as Mode[]).map((m) => <button key={m} type="button" className={`px-2.5 py-1 text-sm capitalize ${mode === m ? "bg-accentSoft text-accent" : "bg-white"}`} aria-pressed={mode === m} onClick={() => setMode(m)}>{m}</button>)}
        </div>
        <select className="input w-44" aria-label="Preview width" value={mode === "mobile" ? 375 : width} onChange={(e) => { const n = Number(e.target.value); setWidth(n); if (n === 375) setMode("mobile"); else if (mode === "mobile") setMode("email"); }}>
          {WIDTHS.map((x) => <option key={x.w} value={x.w}>{x.label}</option>)}
        </select>
        {loading && <span className="text-xs text-neutral-500">Rendering…</span>}
      </div>
      <div className="overflow-x-auto rounded bg-neutral-100 p-3">
        {html ? (
          <iframe sandbox="" srcDoc={doc} title={`${mode} preview`} style={{ width: w, height: 720, background: "white", border: "1px solid #E3E4E0", margin: "0 auto", display: "block" }} />
        ) : <p className="p-6 text-center text-sm text-neutral-500">{loading ? "Rendering preview…" : "Nothing to preview yet."}</p>}
      </div>
    </div>
  );
}
