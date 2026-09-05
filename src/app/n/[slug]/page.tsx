import { loadNewsroomBySlug } from "@/lib/newsroom/data";
import { NewsroomIndexPage, type IndexSearch } from "@/components/newsroom/pages/IndexPage";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: { slug: string }; searchParams: IndexSearch }) {
  const nr = await loadNewsroomBySlug(params.slug);
  return <NewsroomIndexPage nr={nr} searchParams={searchParams} />;
}
