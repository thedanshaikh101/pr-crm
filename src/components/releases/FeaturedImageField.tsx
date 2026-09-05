"use client";
import { useState } from "react";
import { presignFeaturedImage } from "@/server/releases";

/** URL input plus a small direct-to-storage uploader (presigned PUT). */
export function FeaturedImageField({ initial, onChange }: { initial: string; onChange?: (url: string) => void }) {
  const [url, setUrl] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (u: string) => { setUrl(u); onChange?.(u); };
  async function upload(file: File) {
    setBusy(true); setErr("");
    try {
      const { target, url: finalUrl } = await presignFeaturedImage(file.name, file.type || "application/octet-stream");
      const res = await fetch(target.url, { method: target.method, headers: target.headers, body: file });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      set(finalUrl);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <div>
      <label className="label" htmlFor="featuredImageUrl">Featured image</label>
      <div className="flex gap-2">
        <input id="featuredImageUrl" name="featuredImageUrl" className="input" value={url} placeholder="https://… or upload" onChange={(e) => set(e.target.value)} />
        <label className="btn cursor-pointer whitespace-nowrap">{busy ? "Uploading…" : "Upload"}<input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} /></label>
        {url && <button type="button" className="btn" onClick={() => set("")} aria-label="Remove featured image">✕</button>}
      </div>
      {err && <p className="mt-1 text-xs text-bad">{err}</p>}
      {url && <img src={url} alt="" className="mt-2 max-h-40 rounded border border-line" />}
    </div>
  );
}
