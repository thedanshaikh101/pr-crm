import type { Metadata } from "next";
import { loadNewsroomBySlug } from "@/lib/newsroom/data";
import { NewsroomFrame } from "@/components/newsroom/Frame";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const nr = await loadNewsroomBySlug(params.slug);
  return { title: { default: `${nr.account.name} newsroom`, template: `%s | ${nr.account.name}` }, description: `Press releases and media resources from ${nr.account.name}.`, metadataBase: new URL(nr.canonicalBase + "/") };
}

export default async function NewsroomLayout({ params, children }: { params: { slug: string }; children: React.ReactNode }) {
  const nr = await loadNewsroomBySlug(params.slug);
  return <NewsroomFrame nr={nr}>{children}</NewsroomFrame>;
}
