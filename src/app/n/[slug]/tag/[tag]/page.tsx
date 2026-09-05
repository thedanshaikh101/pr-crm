import { loadNewsroomBySlug } from "@/lib/newsroom/data";
import { NewsroomTagPage } from "@/components/newsroom/pages/TagPage";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: { slug: string; tag: string }; searchParams: { page?: string } }) {
  const nr = await loadNewsroomBySlug(params.slug);
  return <NewsroomTagPage nr={nr} tag={params.tag} searchParams={searchParams} />;
}
