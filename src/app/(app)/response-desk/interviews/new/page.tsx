import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { createInterview } from "@/server/responseDesk";
import { InterviewForm } from "@/components/responseDesk/InterviewForm";

export default async function NewInterviewPage({ searchParams }: { searchParams: { contactId?: string; outlet?: string; conversationId?: string } }) {
  const v = await requireViewer();
  const contact = searchParams.contactId ? await db.contact.findFirst({ where: { id: searchParams.contactId, accountId: v.account.id, deletedAt: null }, include: { organization: { select: { name: true } } } }) : null;
  const picked = contact ? { id: contact.id, name: `${contact.firstName} ${contact.lastName}`.trim(), outlet: searchParams.outlet || contact.organization?.name || null, email: contact.email } : null;
  const prefill = searchParams.outlet ? { outletName: searchParams.outlet, spokesperson: "", format: "PHONE", status: "REQUESTED", outcome: null } : null;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2"><Link href="/response-desk/interviews" className="btn">← Interview requests</Link><h1 className="text-xl font-semibold">New interview request</h1></div>
      <InterviewForm action={createInterview} i={prefill as any} contact={picked} submitLabel="Create request" conversationId={searchParams.conversationId} />
    </div>
  );
}
