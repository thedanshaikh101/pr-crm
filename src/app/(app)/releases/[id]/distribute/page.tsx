import { DistributePage } from "@/components/releases/DistributePage";
export default function Page({ params }: { params: { id: string } }) { return <DistributePage kind="PRESS_RELEASE" id={params.id} />; }
