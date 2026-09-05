import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { createTopic } from "@/server/responseDesk";
import { pickList, teammates } from "@/lib/responseDesk/data";
import { TopicForm } from "@/components/responseDesk/TopicForm";

export default async function NewTopicPage() {
  const v = await requireViewer();
  const [themes, types, team] = await Promise.all([db.theme.findMany({ where: { accountId: v.account.id }, orderBy: { name: "asc" } }), pickList(v.account.id, "topic_type"), teammates(v.account.id)]);
  return (
    <div>
      <div className="mb-3 flex items-center gap-2"><Link href="/response-desk/topics" className="btn">← Topics</Link><h1 className="text-xl font-semibold">New topic</h1></div>
      <TopicForm action={createTopic} themes={themes} types={types} team={team} submitLabel="Create topic" />
    </div>
  );
}
