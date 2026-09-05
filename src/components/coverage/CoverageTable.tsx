"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkSetClient, bulkTagCoverage, deleteCoverage } from "@/server/coverage";
import { titleCase } from "@/lib/coverage/filters";

export type CoverageRow = {
  id: string; outlet: string; logoUrl: string | null; orgId: string | null; headline: string; url: string | null; publishedAt: string;
  type: string; focus: string; sentiment: string; client: { id: string; name: string; color: string } | null; release: { id: string; headline: string } | null;
  reach: number | null; ave: number | null; pickups: number; tags: { id: string; name: string; color: string }[]; imageUrl: string | null; summary: string | null;
};
type Col = { key: string; label: string; visible: boolean };

const SENT: Record<string, string> = { POSITIVE: "bg-green-50 text-good", NEUTRAL: "bg-neutral-100 text-neutral-600", NEGATIVE: "bg-red-50 text-bad" };
const money = (n: number | null) => n == null ? "" : n.toLocaleString(undefined, { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const SIZES: Record<number, string> = { 6: "h-6 w-6", 8: "h-8 w-8", 12: "h-12 w-12 text-base" };

export function OutletMark({ name, logoUrl, size = 8 }: { name: string; logoUrl: string | null; size?: 6 | 8 | 12 }) {
  const initials = name.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const dim = SIZES[size] ?? SIZES[8];
  // eslint-disable-next-line @next/next/no-img-element
  return logoUrl ? <img src={logoUrl} alt="" className={`${dim} shrink-0 rounded object-contain`} /> : <span className={`${dim} grid shrink-0 place-items-center overflow-hidden rounded bg-accentSoft text-xs font-semibold text-accent`}>{initials || "?"}</span>;
}

export function SentimentPill({ s }: { s: string }) {
  return <span className={`pill ${SENT[s] ?? SENT.NEUTRAL}`}>{titleCase(s)}</span>;
}

export function CoverageTable({ rows, columns, view, clients }: { rows: CoverageRow[]; columns: Col[]; view: "table" | "cards"; clients: { id: string; name: string }[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const router = useRouter();
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const ids = Array.from(sel);
  const cols = columns.filter((c) => c.visible);
  const check = (r: CoverageRow) => <input type="checkbox" checked={sel.has(r.id)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(r.id) : n.delete(r.id); setSel(n); }} aria-label={`Select ${r.headline}`} />;

  const cell = (r: CoverageRow, key: string) => {
    switch (key) {
      case "outlet": return <span className="flex items-center gap-2"><OutletMark name={r.outlet} logoUrl={r.logoUrl} />{r.orgId ? <Link href={`/organizations/${r.orgId}`} className="hover:underline">{r.outlet}</Link> : r.outlet}</span>;
      case "headline": return <span className="flex items-start gap-1"><Link href={`/coverage/${r.id}`} className="font-medium hover:underline">{r.headline}</Link>{r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-accent" aria-label="Open article in a new tab" title="Open article">↗</a>}</span>;
      case "publishedAt": return new Date(r.publishedAt).toLocaleDateString();
      case "type": return titleCase(r.type);
      case "focus": return titleCase(r.focus);
      case "sentiment": return <SentimentPill s={r.sentiment} />;
      case "client": return r.client ? <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.client.color }} />{r.client.name}</span> : <span className="text-neutral-400">—</span>;
      case "release": return r.release ? <Link href={`/releases/${r.release.id}`} className="line-clamp-1 max-w-xs hover:underline">{r.release.headline}</Link> : <span className="text-neutral-400">—</span>;
      case "reach": return r.reach?.toLocaleString() ?? "";
      case "ave": return money(r.ave);
      case "pickups": return r.pickups ? <Link href={`/coverage/${r.id}#pickups`} className="hover:underline">{r.pickups}</Link> : "";
      case "tags": return <span className="flex flex-wrap gap-1">{r.tags.map((t) => <span key={t.id} className="chip" style={{ background: t.color + "22", color: t.color }}>{t.name}</span>)}</span>;
      default: return "";
    }
  };

  const Bulk = () => sel.size > 0 && (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-accentSoft px-3 py-2 text-sm">
      <span className="font-medium">{sel.size} selected</span>
      <button className="btn" disabled={pending} onClick={() => { const t = prompt("Tag name"); if (t) start(async () => { await bulkTagCoverage(ids, t); setSel(new Set()); router.refresh(); }); }}>Tag</button>
      <select className="input w-48" defaultValue="" aria-label="Set client" onChange={(e) => { const id = e.target.value; if (id) start(async () => { await bulkSetClient(ids, id === "__none" ? null : id); setSel(new Set()); router.refresh(); }); }}>
        <option value="">Set client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="__none">No client</option>
      </select>
      <a className="btn" href={`/api/coverage/export.csv?ids=${ids.join(",")}`}>Export CSV</a>
      <button className="btn btn-danger" disabled={pending} onClick={() => { if (confirm(`Move ${sel.size} item(s) to Deleted Items?`)) start(async () => { await deleteCoverage(ids); setSel(new Set()); router.refresh(); }); }}>Delete</button>
    </div>
  );

  if (view === "cards") return (
    <div>
      <Bulk />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((r) => (
          <div key={r.id} className="card flex flex-col overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {r.imageUrl && <img src={r.imageUrl} alt="" className="h-32 w-full object-cover" />}
            <div className="flex flex-1 flex-col p-3">
              <div className="flex items-start gap-2">
                {check(r)}
                <OutletMark name={r.outlet} logoUrl={r.logoUrl} size={6} />
                <span className="min-w-0 flex-1 truncate text-xs text-neutral-600">{r.outlet} · {new Date(r.publishedAt).toLocaleDateString()}</span>
              </div>
              <Link href={`/coverage/${r.id}`} className="mt-2 line-clamp-2 font-medium hover:underline">{r.headline}</Link>
              {r.summary && <p className="mt-1 line-clamp-2 text-xs text-neutral-600">{r.summary}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-1 pt-2 text-xs">
                <span className="pill bg-neutral-100 text-neutral-600">{titleCase(r.type)}</span>
                <span className="pill bg-neutral-100 text-neutral-600">{titleCase(r.focus)}</span>
                <SentimentPill s={r.sentiment} />
                {r.pickups > 0 && <span className="pill bg-accentSoft text-accent">{r.pickups} pickups</span>}
                {r.client && <span className="ml-auto flex items-center gap-1 text-neutral-600"><span className="inline-block h-2 w-2 rounded-full" style={{ background: r.client.color }} />{r.client.name}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <Bulk />
      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th className="w-8"><input type="checkbox" checked={all} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} aria-label="Select all on page" /></th>
              {cols.map((c) => <th key={c.key} style={{ resize: "horizontal", overflow: "hidden", minWidth: 80 }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{check(r)}</td>
                {cols.map((c) => <td key={c.key}>{cell(r, c.key)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
