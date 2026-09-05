"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToList, bulkTag, deleteContacts } from "@/server/contacts";
import { saveColumnLayout } from "@/server/views";
import { useIsNarrow } from "@/components/useIsNarrow";

type Row = {
  id: string; name: string; outlet: string | null; orgId: string | null; jobTitle: string | null; xBio: string | null; xFollowers: number | null;
  classifications: string[]; email: string | null; emailStatus: string; landline: string | null; mobile: string | null; audienceLocation: string[];
  domainAuthority: number | null; significantUpdate: string | null; isEx: boolean; subjects: string[]; lists: { id: string; name: string }[];
};
type Col = { key: string; label: string; visible: boolean; width?: number };

const MIN_WIDTH = 60;

function Popover({ label, children, name }: { label: React.ReactNode; children: React.ReactNode; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button type="button" className="text-left underline decoration-dotted" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={name}>{label}</button>
      {open && <span className="absolute left-0 top-full z-20 mt-1 block w-64 rounded-md border border-line bg-white p-2 text-xs shadow-lg" onMouseLeave={() => setOpen(false)}>{children}</span>}
    </span>
  );
}

export function ContactTable({ rows, columns, view, lists, screen = "contacts" }: { rows: Row[]; columns: Col[]; view: "table" | "cards"; lists: { id: string; name: string }[]; screen?: string }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const router = useRouter();
  const narrow = useIsNarrow();
  const [explicitView, setExplicitView] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [layout, setLayout] = useState<Col[]>(columns);
  const [widths, setWidths] = useState<Record<string, number>>(() => Object.fromEntries(columns.filter((c) => c.width).map((c) => [c.key, c.width as number])));
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const resize = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const columnsKey = JSON.stringify(columns);
  useEffect(() => { setLayout(columns); setWidths(Object.fromEntries(columns.filter((c) => c.width).map((c) => [c.key, c.width as number]))); }, [columnsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { setExplicitView(localStorage.getItem(`pd:view:${screen}`)); } catch { /* ignore */ } }, [screen]);
  useEffect(() => { if (focusIdx >= rows.length) setFocusIdx(0); }, [rows.length, focusIdx]);

  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const ids = Array.from(sel);
  const cols = layout.filter((c) => c.visible);
  const autoCards = view !== "cards" && narrow && explicitView !== "table";
  const effectiveView = view === "cards" || autoCards ? "cards" : "table";

  const persist = useCallback((nextLayout: Col[], nextWidths: Record<string, number>) => {
    const payload = nextLayout.map((c) => ({ key: c.key, label: c.label, visible: c.visible, ...(nextWidths[c.key] ? { width: nextWidths[c.key] } : {}) }));
    start(async () => { await saveColumnLayout(screen, payload); });
  }, [screen]);

  // --- header drag to reorder
  const dropOn = (key: string) => {
    if (!dragKey || dragKey === key) { setDragKey(null); setOverKey(null); return; }
    const n = [...layout];
    const from = n.findIndex((c) => c.key === dragKey), to = n.findIndex((c) => c.key === key);
    if (from < 0 || to < 0) return;
    const [item] = n.splice(from, 1); n.splice(to, 0, item);
    setLayout(n); setDragKey(null); setOverKey(null);
    persist(n, widths);
    setAnnounce(`Moved ${item.label} column to position ${to + 1}`);
  };

  // --- header edge resize
  const onResizeStart = (key: string, clientX: number, startW: number) => {
    resize.current = { key, startX: clientX, startW };
    const onMove = (e: MouseEvent) => { const r = resize.current; if (!r) return; setWidths((w) => ({ ...w, [r.key]: Math.max(MIN_WIDTH, r.startW + (e.clientX - r.startX)) })); };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.cursor = ""; document.body.style.userSelect = ""; resize.current = null; persist(layoutRef.current, widthsRef.current); };
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
  };
  const nudge = (key: string, delta: number, label: string) => {
    const w = Math.max(MIN_WIDTH, (widths[key] ?? 160) + delta);
    const next = { ...widths, [key]: w };
    setWidths(next); persist(layout, next); setAnnounce(`${label} column ${w} pixels wide`);
  };

  // --- roving tabindex rows
  const focusRow = (i: number) => { const n = Math.max(0, Math.min(rows.length - 1, i)); setFocusIdx(n); rowRefs.current[n]?.focus(); };
  const toggle = (id: string, on?: boolean) => setSel((s) => { const n = new Set(s); const want = on ?? !n.has(id); want ? n.add(id) : n.delete(id); return n; });
  const onRowKey = (e: React.KeyboardEvent<HTMLTableRowElement>, i: number, r: Row) => {
    const onRow = e.target === e.currentTarget;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); focusRow(i + 1); break;
      case "ArrowUp": e.preventDefault(); focusRow(i - 1); break;
      case "Home": e.preventDefault(); focusRow(0); break;
      case "End": e.preventDefault(); focusRow(rows.length - 1); break;
      case "Enter": if (onRow) { e.preventDefault(); router.push(`/contacts/${r.id}`); } break;
      case " ": if (onRow) { e.preventDefault(); toggle(r.id); setAnnounce(`${sel.has(r.id) ? "Deselected" : "Selected"} ${r.name}`); } break;
    }
  };

  const cell = (r: Row, key: string) => {
    switch (key) {
      case "name": return <Link href={`/contacts/${r.id}`} className="font-medium hover:underline" tabIndex={-1}>{r.name}{r.isEx && <span className="pill ml-1 bg-neutral-100 text-neutral-600">ex</span>}</Link>;
      case "outlet": return r.orgId ? <Link href={`/organizations/${r.orgId}`} className="hover:underline" tabIndex={-1}>{r.outlet}</Link> : <span className="text-neutral-400">—</span>;
      case "jobTitle": return r.jobTitle ?? "";
      case "xBio": return <span className="line-clamp-2 max-w-xs text-neutral-600">{r.xBio}</span>;
      case "subjects": return r.subjects.length ? <Popover name={`${r.subjects.length} subjects for ${r.name}`} label={`${r.subjects.length} subject${r.subjects.length > 1 ? "s" : ""}`}>{r.subjects.map((s) => <span key={s} className="chip mb-1 mr-1">{s}</span>)}</Popover> : "";
      case "xFollowers": return r.xFollowers?.toLocaleString() ?? "";
      case "classification": return r.classifications.join(", ");
      case "inList": return r.lists.length ? <Popover name={`${r.lists.length} lists for ${r.name}`} label={`☰ ${r.lists.length}`}>{r.lists.map((l) => <Link key={l.id} href={`/lists/${l.id}`} className="block py-0.5 hover:underline">{l.name}</Link>)}</Popover> : "";
      case "audienceLocation": return r.audienceLocation.join(", ");
      case "domainAuthority": return r.domainAuthority ?? "";
      case "email": return r.email ? <span className={r.emailStatus === "BOUNCED" || r.emailStatus === "INVALID" ? "text-bad line-through" : ""}>{r.email}</span> : "";
      case "landline": return r.landline ?? "";
      case "mobile": return r.mobile ?? "";
      case "significantUpdate": return r.significantUpdate ? <span className="text-warn">{r.significantUpdate}</span> : "";
      default: return "";
    }
  };

  const done = (msg: string) => { setSel(new Set()); setAnnounce(msg); router.refresh(); };
  const bulk = sel.size > 0 && (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-accentSoft px-3 py-2 text-sm" role="toolbar" aria-label="Bulk actions">
      <span className="font-medium">{sel.size} selected</span>
      <select className="input w-48" defaultValue="" onChange={(e) => { const id = e.target.value; const name = lists.find((l) => l.id === id)?.name ?? "list"; if (id) start(async () => { await addToList(id, ids); done(`Added ${ids.length} contact${ids.length === 1 ? "" : "s"} to list ${name}`); }); }} aria-label="Add to list">
        <option value="">Add to list…</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <button className="btn" onClick={() => { const t = prompt("Tag name"); if (t) start(async () => { await bulkTag(ids, t); done(`Tagged ${ids.length} contact${ids.length === 1 ? "" : "s"} with ${t}`); }); }}>Tag</button>
      <a className="btn" href={`/api/export/contacts?ids=${ids.join(",")}`}>Export CSV</a>
      <Link className="btn" href={`/lists/new?smart=1&ids=${ids.join(",")}`}>Add to Smart Group</Link>
      <button className="btn btn-danger" disabled={pending} onClick={() => { if (confirm(`Move ${sel.size} contact(s) to Deleted Items?`)) start(async () => { await deleteContacts(ids); done(`Moved ${ids.length} contact${ids.length === 1 ? "" : "s"} to Deleted Items`); }); }}>Delete</button>
      <button className="btn" onClick={() => { setSel(new Set()); setAnnounce("Selection cleared"); }}>Clear</button>
    </div>
  );
  const live = <div aria-live="polite" aria-atomic="true" className="sr-only">{announce}</div>;

  if (effectiveView === "cards") return (
    <div>
      {live}
      {bulk}
      {autoCards && <p className="mb-2 text-xs text-neutral-500">Showing cards on a narrow screen. Pick the table view above to keep the table.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((r) => (
          <div key={r.id} className="card p-3">
            <div className="flex items-start gap-2">
              <input type="checkbox" checked={sel.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} aria-label={`Select ${r.name}`} />
              <div className="min-w-0">
                <Link href={`/contacts/${r.id}`} className="block truncate font-medium hover:underline">{r.name}</Link>
                <p className="truncate text-xs text-neutral-600">{[r.jobTitle, r.outlet].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
            {r.xBio && <p className="mt-2 line-clamp-3 text-xs text-neutral-600">{r.xBio}</p>}
            <div className="mt-2 flex flex-wrap gap-1">{r.subjects.slice(0, 3).map((s) => <span key={s} className="chip">{s.split(" > ").pop()}</span>)}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      {live}
      {bulk}
      <div className="card overflow-x-auto">
        <table className="data" style={{ tableLayout: Object.keys(widths).length ? "fixed" : undefined, minWidth: "100%", width: Object.keys(widths).length ? "max-content" : undefined }}>
          <thead>
            <tr>
              <th className="w-8" style={{ width: 32 }}><input type="checkbox" checked={all} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} aria-label="Select all on page" /></th>
              {cols.map((c) => (
                <th key={c.key}
                  draggable
                  onDragStart={(e) => { setDragKey(c.key); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.key); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overKey !== c.key) setOverKey(c.key); }}
                  onDragLeave={() => { if (overKey === c.key) setOverKey(null); }}
                  onDrop={(e) => { e.preventDefault(); dropOn(c.key); }}
                  onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                  className={`relative select-none ${dragKey === c.key ? "opacity-50" : ""} ${overKey === c.key && dragKey !== c.key ? "bg-accentSoft" : ""}`}
                  style={{ width: widths[c.key] ?? undefined, minWidth: MIN_WIDTH, cursor: "grab" }}
                  title="Drag to reorder. Drag the right edge to resize."
                >
                  <span className="block truncate pr-2">{c.label}</span>
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${c.label} column`}
                    aria-valuenow={widths[c.key] ?? undefined}
                    tabIndex={0}
                    draggable={false}
                    onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeStart(c.key, e.clientX, widths[c.key] ?? (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().width); }}
                    onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); nudge(c.key, -16, c.label); } else if (e.key === "ArrowRight") { e.preventDefault(); nudge(c.key, 16, c.label); } }}
                    className="absolute right-0 top-0 h-full w-[6px] cursor-col-resize hover:bg-accent/40 focus-visible:bg-accent/60"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}
                ref={(el) => { rowRefs.current[i] = el; }}
                tabIndex={i === focusIdx ? 0 : -1}
                onFocus={(e) => { if (e.target === e.currentTarget) setFocusIdx(i); }}
                onKeyDown={(e) => onRowKey(e, i, r)}
                aria-selected={sel.has(r.id)}
                className={`outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${sel.has(r.id) ? "bg-accentSoft/40" : ""}`}
              >
                <td><input type="checkbox" checked={sel.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} aria-label={`Select ${r.name}`} tabIndex={-1} /></td>
                {cols.map((c) => <td key={c.key} className={widths[c.key] ? "overflow-hidden text-ellipsis" : ""}>{cell(r, c.key)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && <p className="mt-1 text-[11px] text-neutral-500">Keyboard: arrow keys move between rows, Enter opens, Space selects, Home and End jump. Drag column headers to reorder; drag or arrow-key the header edge to resize.</p>}
    </div>
  );
}
