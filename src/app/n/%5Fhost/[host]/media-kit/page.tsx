import { loadNewsroomByHost } from "@/lib/newsroom/data";
import { NewsroomMediaKitPage } from "@/components/newsroom/pages/MediaKitPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Media kit" };

export default async function Page({ params }: { params: { host: string } }) {
  const nr = await loadNewsroomByHost(params.host);
  return <NewsroomMediaKitPage nr={nr} />;
}
