"use client";
import { useState } from "react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { BLOCK_TYPES, newBlockId, type Block, type BlockType } from "@/lib/releases/blockTypes";

function blank(type: BlockType): Block {
  const id = newBlockId();
  switch (type) {
    case "heading": return { id, type, text: "", level: 2 };
    case "text": return { id, type, html: "<p></p>" };
    case "image": return { id, type, url: "", alt: "" };
    case "release": return { id, type, releaseId: "" };
    case "button": return { id, type, label: "Read more", href: "" };
    default: return { id, type: "divider" };
  }
}

/** Newsletter block editor. Serialises the block array into a hidden input named `name`. */
export function BlockEditor({ name, initial, liveReleases, onChange }: { name: string; initial: Block[]; liveReleases: { id: string; headline: string }[]; onChange?: (blocks: Block[]) => void }) {
  const [blocks, setBlocks] = useState<Block[]>(initial);
  const [adding, setAdding] = useState<BlockType>("text");
  const commit = (next: Block[]) => { setBlocks(next); onChange?.(next); };
  const patch = (i: number, p: Partial<Block>) => commit(blocks.map((b, j) => (j === i ? ({ ...b, ...p } as Block) : b)));
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= blocks.length) return; const n = [...blocks]; [n[i], n[j]] = [n[j], n[i]]; commit(n); };
  const remove = (i: number) => commit(blocks.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(blocks)} />
      {blocks.map((b, i) => (
        <div key={b.id} className="rounded-md border border-line bg-white p-3">
          <div className="mb-2 flex items-center gap-1 text-xs">
            <span className="chip capitalize">{b.type}</span>
            <span className="flex-1" />
            <button type="button" className="btn px-2 py-0.5" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move block up">↑</button>
            <button type="button" className="btn px-2 py-0.5" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Move block down">↓</button>
            <button type="button" className="btn btn-danger px-2 py-0.5" onClick={() => remove(i)} aria-label="Remove block">✕</button>
          </div>
          {b.type === "heading" && (
            <div className="flex gap-2">
              <input className="input" value={b.text} placeholder="Heading text" aria-label="Heading text" onChange={(e) => patch(i, { text: e.target.value } as any)} />
              <select className="input w-24" value={b.level ?? 2} aria-label="Heading level" onChange={(e) => patch(i, { level: Number(e.target.value) as 1 | 2 | 3 } as any)}><option value={1}>H1</option><option value={2}>H2</option><option value={3}>H3</option></select>
            </div>
          )}
          {b.type === "text" && <RichTextEditor name={`_block_${b.id}`} compact minHeight={100} defaultValue={b.html} onChange={(html) => patch(i, { html } as any)} />}
          {b.type === "image" && (
            <div className="grid gap-2 sm:grid-cols-3">
              <input className="input" value={b.url} placeholder="Image URL" aria-label="Image URL" onChange={(e) => patch(i, { url: e.target.value } as any)} />
              <input className="input" value={b.alt ?? ""} placeholder="Alt text" aria-label="Alt text" onChange={(e) => patch(i, { alt: e.target.value } as any)} />
              <input className="input" value={b.href ?? ""} placeholder="Link (optional)" aria-label="Image link" onChange={(e) => patch(i, { href: e.target.value } as any)} />
            </div>
          )}
          {b.type === "release" && (
            <select className="input" value={b.releaseId} aria-label="Release" onChange={(e) => patch(i, { releaseId: e.target.value } as any)}>
              <option value="">Choose a live release…</option>{liveReleases.map((r) => <option key={r.id} value={r.id}>{r.headline}</option>)}
            </select>
          )}
          {b.type === "button" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="input" value={b.label} placeholder="Button label" aria-label="Button label" onChange={(e) => patch(i, { label: e.target.value } as any)} />
              <input className="input" value={b.href} placeholder="https://" aria-label="Button link" onChange={(e) => patch(i, { href: e.target.value } as any)} />
            </div>
          )}
          {b.type === "divider" && <hr className="border-line" />}
        </div>
      ))}
      {!blocks.length && <p className="rounded-md border border-dashed border-line p-4 text-center text-sm text-neutral-500">No blocks yet. Add a heading or text block to start.</p>}
      <div className="flex items-center gap-2">
        <select className="input w-40" value={adding} aria-label="Block type" onChange={(e) => setAdding(e.target.value as BlockType)}>{BLOCK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <button type="button" className="btn" onClick={() => commit([...blocks, blank(adding)])}>Add block</button>
      </div>
    </div>
  );
}
