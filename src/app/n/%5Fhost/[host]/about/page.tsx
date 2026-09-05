import { loadNewsroomByHost } from "@/lib/newsroom/data";
import { NewsroomAboutPage } from "@/components/newsroom/pages/AboutPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "About" };

export default async function Page({ params }: { params: { host: string } }) {
  const nr = await loadNewsroomByHost(params.host);
  return <NewsroomAboutPage nr={nr} />;
}
