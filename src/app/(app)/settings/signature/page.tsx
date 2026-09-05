import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateSignature } from "@/server/team";
export default async function Signature() {
  const v = await requireViewer();
  const u = await db.user.findUnique({ where: { id: v.user.id } });
  return (
    <form action={updateSignature} className="card max-w-xl space-y-3 p-4">
      <h1 className="text-xl font-semibold">My Contact Information</h1>
      <p className="text-sm text-neutral-600">The signature block appended to emails you send.</p>
      <textarea name="signatureBlock" rows={6} className="input" defaultValue={u?.signatureBlock ?? `${v.user.name}\n${v.account.name}\n`} />
      <button className="btn btn-primary">Save</button>
    </form>
  );
}
