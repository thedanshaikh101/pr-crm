import type { Metadata } from "next";
import { loadNewsroomByHost } from "@/lib/newsroom/data";
import { NewsroomFrame } from "@/components/newsroom/Frame";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { host: string } }): Promise<Metadata> {
  const nr = await loadNewsroomByHost(params.host);
  return { title: { default: `${nr.account.name} newsroom`, template: `%s | ${nr.account.name}` }, description: `Press releases and media resources from ${nr.account.name}.`, metadataBase: new URL(nr.canonicalBase + "/") };
}

export default async function NewsroomLayout({ params, children }: { params: { host: string }; children: React.ReactNode }) {
  const nr = await loadNewsroomByHost(params.host);
  return <NewsroomFrame nr={nr}>{children}</NewsroomFrame>;
}
