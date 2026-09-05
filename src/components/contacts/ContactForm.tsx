import { CLASSIFICATIONS, IMPORTANCE } from "@/lib/contacts/filters";

export function ContactForm({ action, c, teammates, submitLabel }: {
  action: (form: FormData) => Promise<void>; c?: any; teammates: { id: string; name: string }[]; submitLabel: string;
}) {
  const F = ({ name, label, type = "text", value, placeholder }: { name: string; label: string; type?: string; value?: any; placeholder?: string }) => (
    <div><label className="label" htmlFor={name}>{label}</label><input className="input" id={name} name={name} type={type} defaultValue={value ?? ""} placeholder={placeholder} /></div>
  );
  return (
    <form action={action} className="card grid max-w-3xl gap-3 p-5 sm:grid-cols-2">
      <F name="firstName" label="First name" value={c?.firstName} />
      <F name="lastName" label="Last name" value={c?.lastName} />
      <F name="email" label="Email" type="email" value={c?.email} />
      <F name="jobTitle" label="Job title" value={c?.jobTitle} />
      <F name="outlet" label="Outlet" value={c?.organization?.name} placeholder="Creates the organization if new" />
      <F name="xHandle" label="X handle" value={c?.xHandle} />
      <F name="xFollowers" label="X followers" type="number" value={c?.xFollowers} />
      <F name="landline" label="Landline" value={c?.landline} />
      <F name="mobile" label="Mobile" value={c?.mobile} />
      <F name="physicalLocation" label="Physical location" value={c?.physicalLocation} />
      <F name="audienceLocation" label="Audience location (separate with ;)" value={c?.audienceLocation?.join("; ")} />
      <F name="language" label="Language" value={c?.language} />
      <F name="rssUrl" label="RSS feed URL (for Recent Content)" type="url" value={c?.rssUrl} placeholder="https://example.com/author/feed" />
      <F name="subjects" label="Subjects (Parent > Child; separate with ;)" value={c?.subjects?.map((s: any) => s.subject.path).join("; ")} />
      <div><label className="label" htmlFor="classifications">Classifications (separate with ;)</label><input className="input" id="classifications" name="classifications" list="cls" defaultValue={c?.classifications?.join("; ")} /><datalist id="cls">{CLASSIFICATIONS.map((x) => <option key={x} value={x} />)}</datalist></div>
      <div><label className="label" htmlFor="importance">Importance</label><select className="input" id="importance" name="importance" defaultValue={c?.importance ?? "NOT_RANKED"}>{IMPORTANCE.map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</select></div>
      <div><label className="label" htmlFor="category">Category</label><select className="input" id="category" name="category" defaultValue={c?.category ?? "MEDIA"}>{["MEDIA", "INFLUENCER", "ANALYST", "STAKEHOLDER", "OTHER"].map((x) => <option key={x}>{x}</option>)}</select></div>
      <div><label className="label" htmlFor="ownerId">Relationship owned by</label><select className="input" id="ownerId" name="ownerId" defaultValue={c?.ownerId ?? ""}><option value="">Unassigned</option>{teammates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      <div><label className="label" htmlFor="visibility">Visibility</label><select className="input" id="visibility" name="visibility" defaultValue={c?.visibility ?? "SHARED"}><option value="SHARED">Shared with account</option><option value="PRIVATE">Private to me</option></select></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="bio">Bio</label><textarea className="input" id="bio" name="bio" rows={3} defaultValue={c?.bio ?? ""} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isExJournalist" defaultChecked={c?.isExJournalist} /> Has left the industry (hidden by default)</label>
      <div className="sm:col-span-2"><button className="btn btn-primary">{submitLabel}</button></div>
    </form>
  );
}
