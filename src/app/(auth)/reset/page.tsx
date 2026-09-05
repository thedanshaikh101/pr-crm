import { ResetForm } from "@/components/auth/ResetForm";

export default function ResetPage({ searchParams }: { searchParams: { t?: string } }) {
  return <ResetForm t={searchParams.t ?? null} />;
}
