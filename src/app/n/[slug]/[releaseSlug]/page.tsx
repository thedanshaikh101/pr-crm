import type { Metadata } from "next";
import { loadNewsroomBySlug } from "@/lib/newsroom/data";
import { NewsroomReleasePage, releaseMetadata } from "@/components/newsroom/pages/ReleasePage";

export const dynamic = "force-dynamic";
type P = { params: { slug: string; releaseSlug: string } };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  return releaseMetadata(await loadNewsroomBySlug(params.slug), params.releaseSlug);
}

export default async function Page({ params }: P) {
  const nr = await loadNewsroomBySlug(params.slug);
  return <NewsroomReleasePage nr={nr} releaseSlug={params.releaseSlug} />;
}
