import { ReleaseEditorPage } from "@/components/releases/ReleaseEditorPage";
export default function Page({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string | undefined> }) { return <ReleaseEditorPage kind="PRESS_RELEASE" id={params.id} searchParams={searchParams} />; }
