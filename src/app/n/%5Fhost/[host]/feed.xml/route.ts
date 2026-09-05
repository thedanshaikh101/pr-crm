import { loadNewsroomByHost } from "@/lib/newsroom/data";
import { feedResponse } from "@/lib/newsroom/feed";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { host: string } }) {
  return feedResponse(await loadNewsroomByHost(params.host));
}
