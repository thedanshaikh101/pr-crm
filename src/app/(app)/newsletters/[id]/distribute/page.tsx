import { DistributePage } from "@/components/releases/DistributePage";
export default function Page({ params }: { params: { id: string } }) { return <DistributePage kind="NEWSLETTER" id={params.id} />; }
