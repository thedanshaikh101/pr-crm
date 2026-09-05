"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPickup, fetchCoverageMeta } from "@/server/coverage";

export function PickupForm({ parentId }: { parentId: string }) {
  const [url, setUrl] = useState("");
  const [outlet, setOutlet] = useState("");
  const [headline, setHeadline] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const lookup = () => start(async () => {
    const m = await fetchCoverageMeta(url);
    if (m.outlet) setOutlet(m.outlet);
    if (m.title) setHeadline(m.title);
    if (m.publishedAt) setDate(m.publishedAt.slice(0, 10));
    if (m.canonicalUrl) setUrl(m.canonicalUrl);
    setNote(m.error ? `Could not read the page (${m.error}). Enter the details by hand.` : "Details filled in from the page.");
  });
  return (
    <form
      className="grid gap-2 rounded-md border border-dashed border-line p-3 sm:grid-cols-[1fr_auto]"
      action={(fd) => start(async () => { setNote(null); try { await addPickup(parentId, fd); setUrl(""); setOutlet(""); setHeadline(""); setDate(""); router.refresh(); } catch (e) { setNote((e as Error).message); } })}
    >
      <div className="flex gap-2 sm:col-span-2">
        <input className="input" type="url" name="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Pickup URL (optional)" aria-label="Pickup URL" />
        <button type="button" className="btn" disabled={pending || !url} onClick={lookup}>{pending ? "…" : "Fetch"}</button>
      </div>
      <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
        <input className="input" name="outletName" value={outlet} onChange={(e) => setOutlet(e.target.value)} placeholder="Outlet" aria-label="Pickup outlet" required />
        <input className="input" name="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline (defaults to the original)" aria-label="Pickup headline" />
        <input className="input" name="publishedAt" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Pickup date" />
      </div>
      <div className="flex items-center gap-2 sm:col-span-2"><button className="btn btn-primary" disabled={pending}>Add pickup</button>{note && <span className="text-xs text-neutral-600" role="status">{note}</span>}</div>
    </form>
  );
}
