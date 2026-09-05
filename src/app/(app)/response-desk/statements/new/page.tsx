import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { createStatement } from "@/server/responseDesk";
import { topicOptions } from "@/lib/responseDesk/data";
import { StatementForm } from "@/components/responseDesk/StatementForm";

export default async function NewStatementPage({ searchParams }: { searchParams: { topicId?: string; title?: string } }) {
  const v = await requireViewer();
  const topics = await topicOptions(v.account.id);
  const prefill = searchParams.topicId || searchParams.title ? { title: searchParams.title ?? "", topicId: searchParams.topicId ?? null, body: "", expiresAt: null } : null;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2"><Link href="/response-desk/statements" className="btn">← Statements</Link><h1 className="text-xl font-semibold">New statement</h1></div>
      <StatementForm action={createStatement} s={prefill} topics={topics} submitLabel="Create statement" />
    </div>
  );
}
