import { loadNewsroomBySlug } from "@/lib/newsroom/data";
import { NewsroomAboutPage } from "@/components/newsroom/pages/AboutPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "About" };

export default async function Page({ params }: { params: { slug: string } }) {
  const nr = await loadNewsroomBySlug(params.slug);
  return <NewsroomAboutPage nr={nr} />;
}
