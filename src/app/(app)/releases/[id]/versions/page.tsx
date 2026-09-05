import { VersionsPage } from "@/components/releases/VersionsPage";
export default function Page({ params }: { params: { id: string } }) { return <VersionsPage kind="PRESS_RELEASE" id={params.id} />; }
