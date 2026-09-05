import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateMe } from "@/server/team";
import { limitsFor } from "@/lib/plans";

export default async function MySettings() {
  const v = await requireViewer();
  const u = await db.user.findUnique({ where: { id: v.user.id } });
  const prefs = (u?.notifyPrefs ?? {}) as Record<string, boolean>;
  const period = new Date().toISOString().slice(0, 7);
  const [contacts, usage, lim] = await Promise.all([db.contact.count({ where: { accountId: v.account.id, deletedAt: null } }), db.usageCounter.findUnique({ where: { accountId_period: { accountId: v.account.id, period } } }), limitsFor(v.account.plan)]);
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">My Settings</h1>
      <form action={updateMe} className="card space-y-3 p-4">
        <div><label className="label">Name</label><input name="name" className="input" defaultValue={u?.name} /></div>
        <div><label className="label">Avatar URL</label><input name="avatarUrl" className="input" defaultValue={u?.avatarUrl ?? ""} /></div>
        <div><label className="label">Timezone</label><input name="timezone" className="input" defaultValue={u?.timezone} placeholder="America/Toronto" /></div>
        <fieldset><legend className="label">Notifications</legend>
          <label className="mr-4 text-sm"><input type="checkbox" name="n_opens" defaultChecked={prefs.opens} /> Opens</label>
          <label className="mr-4 text-sm"><input type="checkbox" name="n_replies" defaultChecked={prefs.replies ?? true} /> Replies</label>
          <label className="text-sm"><input type="checkbox" name="n_digest" defaultChecked={prefs.digest ?? true} /> Daily digest</label>
        </fieldset>
        <div className="grid gap-2 sm:grid-cols-2"><div><label className="label">Current password</label><input name="currentPassword" type="password" className="input" autoComplete="current-password" /></div><div><label className="label">New password</label><input name="newPassword" type="password" className="input" autoComplete="new-password" /></div></div>
        <button className="btn btn-primary">Save</button>
      </form>
      <section className="card p-4 text-sm">
        <h2 className="mb-2 font-semibold">Usage this month ({v.account.plan.toLowerCase()} plan)</h2>
        <p>Contacts: {contacts.toLocaleString()} of {lim.contacts.toLocaleString()}</p>
        <p>Emails sent: {(usage?.emailsSent ?? 0).toLocaleString()} of {lim.emailsPerMonth.toLocaleString()}</p>
        <p>Newsrooms: 1 of {lim.newsrooms}</p>
      </section>
    </div>
  );
}
