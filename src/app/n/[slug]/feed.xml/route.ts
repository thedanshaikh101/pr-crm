import { loadNewsroomBySlug } from "@/lib/newsroom/data";
import { feedResponse } from "@/lib/newsroom/feed";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  return feedResponse(await loadNewsroomBySlug(params.slug));
}
