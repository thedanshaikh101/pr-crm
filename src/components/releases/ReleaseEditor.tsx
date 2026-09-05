"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { analyzeRelease } from "@/lib/releases/analyze";
import { slugBase } from "@/lib/releases/slug";
import type { Block } from "@/lib/releases/blockTypes";
import { autosaveRelease, createRelease, renderPreview, updateRelease } from "@/server/releases";
import { BlockEditor } from "./BlockEditor";
import { FeaturedImageField } from "./FeaturedImageField";
import { PreviewFrame, type PreviewHtml } from "./PreviewFrame";

const Sel = ({ name, label, value, onChange, items, placeholder }: { name: string; label: string; value: string; onChange: (v: string) => void; items: { id: string; name: string }[]; placeholder: string }) => (
  <div><label className="label" htmlFor={name}>{label}</label><select id={name} name={name} className="input" value={value} onChange={(e) => onChange(e.target.value)}><option value="">{placeholder}</option>{items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
);

export type EditorInitial = {
  headline: string; subheadline: string; datelineCity: string; datelineDate: string; body: string; blocks: Block[];
  boilerplateId: string; footerId: string; mediaContactId: string; featuredImageUrl: string; clientId: string; proactivity: string;
  embargoUntil: string; slug: string; tagIds: string[]; assetIds: string[]; status: string;
};
export type EditorOptions = {
  boilerplates: { id: string; name: string; kind: string; clientId: string | null }[];
  clients: { id: string; name: string; color: string }[];
  tags: { id: string; name: string; color: string }[];
  assets: { id: string; name: string; kind: string }[];
  liveReleases: { id: string; headline: string }[];
};

export function ReleaseEditor({ kind, releaseId, initial, options, base, notice }: {
  kind: "PRESS_RELEASE" | "NEWSLETTER"; releaseId: string | null; initial: EditorInitial; options: EditorOptions; base: string; notice?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [id, setId] = useState(releaseId);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [headline, setHeadline] = useState(initial.headline);
  const [subheadline, setSubheadline] = useState(initial.subheadline);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(!!initial.slug);
  const [body, setBody] = useState(initial.body);
  const [blocks, setBlocks] = useState<Block[]>(initial.blocks);
  const [clientId, setClientId] = useState(initial.clientId);
  const [boilerplateId, setBoilerplateId] = useState(initial.boilerplateId);
  const [footerId, setFooterId] = useState(initial.footerId);
  const [mediaContactId, setMediaContactId] = useState(initial.mediaContactId);
  const [featured, setFeatured] = useState(initial.featuredImageUrl);
  const [embargo, setEmbargo] = useState(initial.embargoUntil);
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<PreviewHtml | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const isNewsletter = kind === "NEWSLETTER";

  const markDirty = useCallback(() => setDirty(true), []);
  const formData = useCallback((intent: string) => { const fd = new FormData(formRef.current!); fd.set("intent", intent); fd.set("kind", kind); return fd; }, [kind]);

  // Autosave every ~3s while dirty. Never creates a version.
  useEffect(() => {
    const t = setInterval(async () => {
      if (!dirty || saveState === "saving" || pending || !formRef.current) return;
      if (!headline.trim()) return;
      setSaveState("saving");
      try {
        const r = await autosaveRelease(id, formData("autosave"));
        setSavedAt(r.savedAt); setDirty(false); setSaveState("idle");
        if (!id) { setId(r.id); window.history.replaceState(null, "", `${base}/${r.id}/edit`); }
        if (!slugTouched && r.slug !== slug) setSlug(r.slug);
      } catch (e) { setSaveState("error"); setError((e as Error).message); }
    }, 3000);
    return () => clearInterval(t);
  }, [dirty, saveState, pending, id, headline, formData, base, slugTouched, slug]);

  // Preview renders on demand and again ~1s after edits while open.
  useEffect(() => {
    if (!showPreview || !formRef.current) return;
    const t = setTimeout(async () => { setPreviewLoading(true); try { setPreview(await renderPreview(formData("autosave"))); } finally { setPreviewLoading(false); } }, preview ? 1000 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreview, headline, subheadline, body, blocks, boilerplateId, mediaContactId, featured, clientId]);

  const submit = (intent: "save" | "publish") => start(async () => {
    setError("");
    try { const fd = formData(intent); if (id) await updateRelease(id, fd); else await createRelease(fd); }
    catch (e) { const msg = (e as Error).message ?? ""; if (!/NEXT_REDIRECT/.test(msg)) setError(msg); }
  });

  const badges = useMemo(() => analyzeRelease({ headline, subheadline, body: isNewsletter ? blocks.map((b) => (b.type === "text" ? b.html : b.type === "heading" ? `<p>${b.text}</p>` : "")).join("") : body, featuredImageUrl: featured, boilerplateId, mediaContactId, embargoUntil: embargo || null }), [headline, subheadline, body, blocks, featured, boilerplateId, mediaContactId, embargo, isNewsletter]);
  const bpFor = (k: string) => options.boilerplates.filter((b) => b.kind === k && (!b.clientId || !clientId || b.clientId === clientId));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={id ? `${base}/${id}` : base} className="btn">← Back</Link>
        <h1 className="text-xl font-semibold">{id ? "Edit" : "New"} {isNewsletter ? "newsletter" : "press release"}</h1>
        <span className="text-xs text-neutral-500">{saveState === "saving" ? "Saving…" : saveState === "error" ? "Autosave failed" : savedAt ? `Autosaved ${new Date(savedAt).toLocaleTimeString()}` : dirty ? "Unsaved changes" : ""}</span>
        <span className="flex-1" />
        <button type="button" className={`btn ${showPreview ? "bg-accentSoft text-accent" : ""}`} onClick={() => setShowPreview(!showPreview)} aria-pressed={showPreview}>Preview</button>
        {id && <Link href={`${base}/${id}/versions`} className="btn">Versions</Link>}
        {id && <Link href={`${base}/${id}/distribute`} className="btn">Distribute</Link>}
        <button type="button" className="btn" disabled={pending} onClick={() => submit("save")}>Save</button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => submit("publish")}>{initial.status === "LIVE" ? "Save and republish" : "Publish"}</button>
      </div>
      {notice && <p className="mb-3 rounded bg-green-50 px-3 py-2 text-sm text-good">{notice}</p>}
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-bad">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div>
          {showPreview && <div className="mb-4"><PreviewFrame html={preview} loading={previewLoading} /></div>}
          <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit("save"); }} onChange={markDirty} className="card space-y-4 p-5">
            <input type="hidden" name="kind" value={kind} />
            <div><label className="label" htmlFor="headline">Headline</label><input id="headline" name="headline" className="input text-base font-semibold" required value={headline} onChange={(e) => { setHeadline(e.target.value); if (!slugTouched) setSlug(slugBase(e.target.value)); }} placeholder={isNewsletter ? "Newsletter subject line" : "What happened, in one line"} /></div>
            <div><label className="label" htmlFor="subheadline">Subheadline</label><input id="subheadline" name="subheadline" className="input" value={subheadline} onChange={(e) => setSubheadline(e.target.value)} /></div>
            {!isNewsletter && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label" htmlFor="datelineCity">Dateline city</label><input id="datelineCity" name="datelineCity" className="input" defaultValue={initial.datelineCity} placeholder="TORONTO" /></div>
                <div><label className="label" htmlFor="datelineDate">Dateline date</label><input id="datelineDate" name="datelineDate" type="date" className="input" defaultValue={initial.datelineDate} /></div>
              </div>
            )}
            {isNewsletter ? (
              <div><span className="label">Blocks</span><BlockEditor name="blocks" initial={initial.blocks} liveReleases={options.liveReleases} onChange={(b) => { setBlocks(b); markDirty(); }} /><input type="hidden" name="body" value="" /></div>
            ) : (
              <div><span className="label">Body</span><RichTextEditor name="body" defaultValue={initial.body} onChange={(h) => { setBody(h); markDirty(); }} placeholder="Lead with the news. Quotes and background follow." /></div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Sel name="clientId" label="Client" value={clientId} onChange={setClientId} items={options.clients} placeholder="No client" />
              <div><label className="label" htmlFor="proactivity">Proactivity</label><select id="proactivity" name="proactivity" className="input" defaultValue={initial.proactivity}><option value="UNSET">Not set</option><option value="PROACTIVE">Proactive</option><option value="REACTIVE">Reactive</option></select></div>
              <Sel name="boilerplateId" label="Boilerplate" value={boilerplateId} onChange={setBoilerplateId} items={bpFor("BOILERPLATE")} placeholder="No boilerplate" />
              <Sel name="footerId" label="Footer" value={footerId} onChange={setFooterId} items={bpFor("FOOTER")} placeholder="No footer" />
              {!isNewsletter && <Sel name="mediaContactId" label="Media contact" value={mediaContactId} onChange={setMediaContactId} items={bpFor("MEDIA_CONTACT")} placeholder="No media contact" />}
              <div><label className="label" htmlFor="embargoUntil">Embargo until</label><input id="embargoUntil" name="embargoUntil" type="datetime-local" className="input" value={embargo} onChange={(e) => setEmbargo(e.target.value)} /></div>
            </div>
            <FeaturedImageField initial={initial.featuredImageUrl} onChange={(u) => { setFeatured(u); markDirty(); }} />
            <div>
              <span className="label">Tags</span>
              <div className="flex flex-wrap gap-2">{options.tags.map((t) => <label key={t.id} className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs"><input type="checkbox" name="tagIds" value={t.id} defaultChecked={initial.tagIds.includes(t.id)} /><span style={{ color: t.color }}>{t.name}</span></label>)}</div>
              <input name="newTags" className="input mt-2" placeholder="New tags, comma separated" aria-label="New tags" />
            </div>
            <details className="rounded-md border border-line p-3">
              <summary className="cursor-pointer text-sm font-medium">Attachments ({initial.assetIds.length} selected)</summary>
              {options.assets.length ? <div className="mt-2 grid gap-1 sm:grid-cols-2">{options.assets.map((a) => <label key={a.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="assetIds" value={a.id} defaultChecked={initial.assetIds.includes(a.id)} />{a.name} <span className="text-xs text-neutral-400">{a.kind}</span></label>)}</div> : <p className="mt-2 text-xs text-neutral-500">No files in the Resource Library yet. Upload files under Content Hub, Resource Library.</p>}
            </details>
            <div><label className="label" htmlFor="slug">Newsroom slug</label><input id="slug" name="slug" className="input font-mono text-xs" value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} /><p className="mt-1 text-xs text-neutral-500">Unique within your newsroom. A suffix is added if it is taken.</p></div>
            <div className="flex gap-2"><button className="btn" disabled={pending}>Save</button><button type="button" className="btn btn-primary" disabled={pending} onClick={() => submit("publish")}>{initial.status === "LIVE" ? "Save and republish" : "Publish"}</button></div>
          </form>
        </div>

        <aside className="space-y-3">
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Checks</h2>
            <ul className="space-y-1 text-sm">{badges.map((b) => (
              <li key={b.key} className="flex items-start gap-2"><span className={`mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${b.level === "good" ? "bg-good" : b.level === "warn" ? "bg-warn" : "bg-neutral-300"}`} aria-hidden /><span>{b.label}{b.detail && <span className="block text-xs text-neutral-500">{b.detail}</span>}</span></li>
            ))}</ul>
          </section>
          <section className="card p-4 text-xs text-neutral-600">
            <p>Autosave runs every few seconds while you type. Save creates a version you can restore later. Publish makes the release live on the newsroom.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
