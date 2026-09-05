import { ReleaseListPage } from "@/components/releases/ReleaseListPage";
export default function Page({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) { return <ReleaseListPage kind="NEWSLETTER" searchParams={searchParams} />; }
