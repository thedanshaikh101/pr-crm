import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ImagePicker } from "@/components/newsroom/ImagePicker";
import { CopyLinkButton } from "@/components/newsroom/CopyLinkButton";
import { NEWSROOM_FONTS, SOCIAL_KEYS, normalizeSocials } from "@/lib/newsroom/theme";
import { cnameTarget, envFromProcess, previewUrls } from "@/lib/newsroom/urls";
import { removeCustomDomain, saveCustomDomain, updateNewsroomSettings, verifyCustomDomain } from "@/server/newsroom";

const SOCIAL_LABELS: Record<string, string> = { website: "Website", x: "X", linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram", youtube: "YouTube" };

export default async function NewsroomSettings({ searchParams }: { searchParams: { saved?: string; domain?: string; found?: string; target?: string } }) {
  const v = await requireViewer();
  const canAdmin = v.role === "OWNER" || v.role === "ADMIN";
  const [s, images] = await Promise.all([
    db.newsroomSettings.upsert({ where: { accountId: v.account.id }, create: { accountId: v.account.id }, update: {} }),
    db.asset.findMany({ where: { accountId: v.account.id, deletedAt: null, kind: { in: ["image", "logo", "headshot"] } }, orderBy: { name: "asc" }, take: 200 }),
  ]);
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const options = images.map((a: any) => ({ id: a.id, name: `${a.name} (${a.kind})`, url: a.externalUrl ?? `${appUrl}/api/library/public/${a.publicToken}` }));
  const socials = normalizeSocials(s.socials);
  const env = envFromProcess();
  const urls = previewUrls(v.account, s, env);
  const target = cnameTarget(v.account, env);
  const d = searchParams.domain;

  return (
    <div className="max-w-3xl">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Newsroom</h1>
        <Link href={`/n/${v.account.slug}`} target="_blank" className="btn">Open newsroom ↗</Link>
      </div>
      {searchParams.saved && <p className="mb-3 rounded bg-green-50 px-3 py-2 text-sm text-good">Settings saved.</p>}
      {!canAdmin && <p className="mb-3 rounded bg-neutral-100 px-3 py-2 text-xs text-neutral-600">You can view these settings. An admin can change them.</p>}

      <section className="card mb-4 p-4 text-sm">
        <h2 className="mb-2 font-semibold">Where your newsroom lives</h2>
        <ul className="space-y-1">
          <li className="flex items-center gap-2"><span className="w-28 text-neutral-500">Path</span><a href={urls.path} className="underline" target="_blank">{urls.path}</a><CopyLinkButton url={urls.path} label="Copy" className="btn px-2 py-0.5 text-xs" /></li>
          <li className="flex items-center gap-2"><span className="w-28 text-neutral-500">Subdomain</span><a href={urls.sub} className="underline" target="_blank">{urls.sub}</a><CopyLinkButton url={urls.sub} label="Copy" className="btn px-2 py-0.5 text-xs" /></li>
          {urls.custom && <li className="flex items-center gap-2"><span className="w-28 text-neutral-500">Custom domain</span><a href={urls.custom} className="underline" target="_blank">{urls.custom}</a>{s.domainVerifiedAt ? <span className="pill bg-green-50 text-good">verified</span> : <span className="pill bg-yellow-50 text-warn">not verified</span>}</li>}
        </ul>
      </section>

      <form action={updateNewsroomSettings} className="space-y-4">
        <fieldset disabled={!canAdmin} className="space-y-4">
          <section className="card space-y-3 p-4">
            <h2 className="font-semibold">Look</h2>
            <ImagePicker name="logoUrl" label="Logo" defaultValue={s.logoUrl ?? ""} options={options} />
            <ImagePicker name="headerImageUrl" label="Header image" defaultValue={s.headerImageUrl ?? ""} options={options} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="primaryColor">Primary colour</label><div className="flex items-center gap-2"><input id="primaryColor" name="primaryColor" type="color" defaultValue={s.primaryColor} className="h-9 w-14 rounded border border-line" /><span className="text-xs text-neutral-500">Links, buttons and the account name.</span></div></div>
              <div><label className="label" htmlFor="fontFamily">Font</label><select id="fontFamily" name="fontFamily" defaultValue={s.fontFamily} className="input">{NEWSROOM_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="showSearch" defaultChecked={s.showSearch} /> Show search box</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="showRss" defaultChecked={s.showRss} /> Publish RSS feed</label>
            </div>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="font-semibold">Content blocks</h2>
            <div><p className="label">About page</p><RichTextEditor name="aboutHtml" defaultValue={s.aboutHtml ?? ""} minHeight={160} placeholder="Who you are, what you do, who to call." /></div>
            <div><p className="label">Media kit introduction</p><RichTextEditor name="mediaKitHtml" defaultValue={s.mediaKitHtml ?? ""} minHeight={120} placeholder="Usage notes for logos, headshots and documents." /></div>
            <div><p className="label">Default media contact</p><RichTextEditor name="mediaContactHtml" defaultValue={s.mediaContactHtml ?? ""} minHeight={100} compact placeholder="Name, title, phone, email." /><p className="mt-1 text-xs text-neutral-500">Shown on releases without their own media contact boilerplate, and on the media kit.</p></div>
            <div><p className="label">Footer</p><RichTextEditor name="footerHtml" defaultValue={s.footerHtml ?? ""} minHeight={80} compact placeholder="Address, legal line, links." /></div>
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Social links</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {SOCIAL_KEYS.map((k) => <div key={k}><label className="label" htmlFor={`social_${k}`}>{SOCIAL_LABELS[k]}</label><input id={`social_${k}`} name={`social_${k}`} type="url" defaultValue={socials[k] ?? ""} className="input" placeholder="https://" /></div>)}
            </div>
          </section>
          {canAdmin && <button className="btn btn-primary">Save settings</button>}
        </fieldset>
      </form>

      <section className="card mt-6 p-4 text-sm" id="domain">
        <h2 className="mb-1 font-semibold">Custom domain</h2>
        <p className="mb-3 text-xs text-neutral-600">Serve the newsroom from your own hostname, for example news.yourbrand.com.</p>
        {d === "saved" && <p className="mb-2 rounded bg-green-50 px-3 py-2 text-good">Domain saved. Add the DNS record, then verify.</p>}
        {d === "verified" && <p className="mb-2 rounded bg-green-50 px-3 py-2 text-good">Domain verified. Requests to it now render your newsroom.</p>}
        {d === "removed" && <p className="mb-2 rounded bg-neutral-100 px-3 py-2">Domain removed.</p>}
        {d === "error" && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-bad">{searchParams.found ?? "Could not save that domain."}</p>}
        {d === "missing" && <p className="mb-2 rounded bg-yellow-50 px-3 py-2 text-warn">Save a domain first.</p>}
        {d === "failed" && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-bad">Not verified yet. We found {searchParams.found ?? "nothing"}; expected a CNAME to {searchParams.target ?? target}. DNS changes can take up to an hour to show.</p>}
        <form action={saveCustomDomain} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[14rem]"><label className="label" htmlFor="customDomain">Domain</label><input id="customDomain" name="customDomain" defaultValue={s.customDomain ?? ""} className="input" placeholder="news.yourbrand.com" disabled={!canAdmin} /></div>
          {canAdmin && <button className="btn">Save domain</button>}
        </form>
        {s.customDomain && (
          <div className="mt-3 space-y-2">
            <p className="flex items-center gap-2">Status: {s.domainVerifiedAt ? <span className="pill bg-green-50 text-good">verified {s.domainVerifiedAt.toLocaleDateString()}</span> : <span className="pill bg-yellow-50 text-warn">pending verification</span>}</p>
            <p className="rounded bg-neutral-50 p-3 font-mono text-xs">Create a CNAME from <strong>{s.customDomain}</strong> to <strong>{target}</strong></p>
            <p className="text-xs text-neutral-600">TLS for custom domains is issued at the edge (Caddy on-demand TLS or fly certs add). See docs/DEPLOY.md.</p>
            {canAdmin && (
              <div className="flex gap-2">
                <form action={verifyCustomDomain}><button className="btn btn-primary">Verify DNS</button></form>
                <form action={removeCustomDomain}><button className="btn btn-danger">Remove domain</button></form>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
