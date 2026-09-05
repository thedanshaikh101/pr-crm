import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { createConversation } from "@/server/responseDesk";
import { pickList, teammates, topicOptions } from "@/lib/responseDesk/data";
import { ConversationForm } from "@/components/responseDesk/ConversationForm";

export default async function NewConversationPage({ searchParams }: { searchParams: { contactId?: string; topicId?: string } }) {
  const v = await requireViewer();
  const a = v.account.id;
  const [caseTypes, team, topics, contact] = await Promise.all([
    pickList(a, "case_type"), teammates(a), topicOptions(a),
    searchParams.contactId ? db.contact.findFirst({ where: { id: searchParams.contactId, accountId: a, deletedAt: null }, include: { organization: { select: { name: true } } } }) : null,
  ]);
  const picked = contact ? { id: contact.id, name: `${contact.firstName} ${contact.lastName}`.trim(), outlet: contact.organization?.name ?? null, email: contact.email } : null;
  const prefill = searchParams.topicId ? { outletName: null, channel: "EMAIL", caseType: null, receivedAt: new Date(), deadline: null, question: "", assigneeId: null, topicId: searchParams.topicId } : null;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2"><Link href="/response-desk/conversations" className="btn">← Conversations</Link><h1 className="text-xl font-semibold">Log a conversation</h1></div>
      <ConversationForm action={createConversation} c={prefill} contact={picked} caseTypes={caseTypes} team={team} topics={topics} submitLabel="Save conversation" defaultAssignee={v.user.id} />
    </div>
  );
}
