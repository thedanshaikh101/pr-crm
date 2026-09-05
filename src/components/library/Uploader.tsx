"use client";
// Browser upload: request a target, PUT the bytes, finalize with image dimensions.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { abandonUpload, finalizeUpload, requestUpload } from "@/server/library";
import { MAX_UPLOAD_BYTES, formatBytes, isAllowedMime } from "@/lib/library/kinds";

type Item = { key: string; name: string; size: number; progress: number; status: "queued" | "uploading" | "done" | "error"; error?: string };

function imageDims(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

function putWithProgress(url: string, headers: Record<string, string>, file: File, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

export function Uploader({ folderId, canWrite }: { folderId: string | null; canWrite: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  async function uploadOne(file: File, key: string) {
    const mime = file.type || "application/octet-stream";
    if (file.size > MAX_UPLOAD_BYTES) return patch(key, { status: "error", error: "Larger than 50 MB" });
    if (!isAllowedMime(mime)) return patch(key, { status: "error", error: mime.startsWith("video/") ? "Add videos as links instead" : `Type ${mime} not allowed` });
    let assetId: string | null = null;
    try {
      patch(key, { status: "uploading", progress: 0 });
      const r = await requestUpload({ name: file.name, mime, size: file.size, folderId });
      assetId = r.assetId;
      await putWithProgress(r.target.url, r.target.headers, file, (pct) => patch(key, { progress: pct }));
      const dims = await imageDims(file);
      await finalizeUpload(r.assetId, dims ?? {});
      patch(key, { status: "done", progress: 100 });
    } catch (e) {
      patch(key, { status: "error", error: (e as Error).message });
      if (assetId) abandonUpload(assetId).catch(() => {});
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    const fresh = list.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, size: f.size, progress: 0, status: "queued" as const }));
    setItems((cur) => [...fresh, ...cur]);
    for (let i = 0; i < list.length; i++) await uploadOne(list[i], fresh[i].key);
    router.refresh();
  }

  if (!canWrite) return null;
  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handleFiles(e.dataTransfer.files); }}
        className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-sm ${over ? "border-accent bg-accentSoft" : "border-line bg-white"}`}
      >
        <span className="text-neutral-600">Drop files here, or</span>
        <button type="button" className="btn" onClick={() => inputRef.current?.click()}>Choose files</button>
        <input ref={inputRef} type="file" multiple className="hidden" aria-label="Choose files to upload" accept="image/*,.pdf,.docx,.txt" onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
        <span className="w-full text-xs text-neutral-500">Images, PDF, DOCX and TXT up to 50 MB each. Videos go in as links.</span>
      </div>
      {items.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {items.slice(0, 12).map((i) => (
            <li key={i.key} className="flex items-center gap-2 rounded border border-line bg-white px-2 py-1">
              <span className="min-w-0 flex-1 truncate">{i.name} <span className="text-neutral-400">{formatBytes(i.size)}</span></span>
              {i.status === "uploading" && <span className="h-1.5 w-24 overflow-hidden rounded bg-neutral-100"><span className="block h-full bg-accent" style={{ width: `${i.progress}%` }} /></span>}
              {i.status === "done" && <span className="text-good">Uploaded</span>}
              {i.status === "queued" && <span className="text-neutral-400">Waiting</span>}
              {i.status === "error" && <span className="text-bad">{i.error}</span>}
            </li>
          ))}
          {items.some((i) => i.status === "done" || i.status === "error") && <li><button type="button" className="text-neutral-500 underline" onClick={() => setItems((l) => l.filter((i) => i.status === "uploading" || i.status === "queued"))}>Clear finished</button></li>}
        </ul>
      )}
    </div>
  );
}
