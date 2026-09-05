import { ReleaseDetail } from "@/components/releases/ReleaseDetail";
export default function Page({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string | undefined> }) { return <ReleaseDetail kind="NEWSLETTER" id={params.id} searchParams={searchParams} />; }
