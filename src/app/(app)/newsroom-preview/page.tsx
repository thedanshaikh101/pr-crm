import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";

export default async function Page() {
  const v = await requireViewer();
  redirect(`/n/${v.account.slug}`);
}
