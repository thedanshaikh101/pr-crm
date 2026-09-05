import { loadNewsroomByHost } from "@/lib/newsroom/data";
import { NewsroomIndexPage, type IndexSearch } from "@/components/newsroom/pages/IndexPage";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: { host: string }; searchParams: IndexSearch }) {
  const nr = await loadNewsroomByHost(params.host);
  return <NewsroomIndexPage nr={nr} searchParams={searchParams} />;
}
