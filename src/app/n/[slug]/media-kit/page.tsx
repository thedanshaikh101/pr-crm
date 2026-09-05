import { loadNewsroomBySlug } from "@/lib/newsroom/data";
import { NewsroomMediaKitPage } from "@/components/newsroom/pages/MediaKitPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Media kit" };

export default async function Page({ params }: { params: { slug: string } }) {
  const nr = await loadNewsroomBySlug(params.slug);
  return <NewsroomMediaKitPage nr={nr} />;
}
