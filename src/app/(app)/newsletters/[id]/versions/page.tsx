import { VersionsPage } from "@/components/releases/VersionsPage";
export default function Page({ params }: { params: { id: string } }) { return <VersionsPage kind="NEWSLETTER" id={params.id} />; }
