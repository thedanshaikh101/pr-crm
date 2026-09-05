import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { createContact } from "@/server/contacts";
import { ContactForm } from "@/components/contacts/ContactForm";

export default async function NewContact() {
  const v = await requireViewer();
  const team = await db.membership.findMany({ where: { accountId: v.account.id, deactivatedAt: null }, include: { user: { select: { id: true, name: true } } } });
  return (<div><h1 className="mb-3 text-xl font-semibold">Add contact</h1><ContactForm action={createContact} teammates={team.map((m: any) => m.user)} submitLabel="Save contact" /></div>);
}
