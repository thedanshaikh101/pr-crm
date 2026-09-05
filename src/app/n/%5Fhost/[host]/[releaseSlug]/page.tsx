import type { Metadata } from "next";
import { loadNewsroomByHost } from "@/lib/newsroom/data";
import { NewsroomReleasePage, releaseMetadata } from "@/components/newsroom/pages/ReleasePage";

export const dynamic = "force-dynamic";
type P = { params: { host: string; releaseSlug: string } };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  return releaseMetadata(await loadNewsroomByHost(params.host), params.releaseSlug);
}

export default async function Page({ params }: P) {
  const nr = await loadNewsroomByHost(params.host);
  return <NewsroomReleasePage nr={nr} releaseSlug={params.releaseSlug} />;
}
