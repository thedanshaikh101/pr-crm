import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyToken } from "@/server/auth";

export default async function VerifyPage({ searchParams }: { searchParams: { t?: string; m?: string } }) {
  if (!searchParams.t) return <p>Missing token.</p>;
  const ok = await verifyToken(searchParams.t, searchParams.m === "1");
  if (ok) redirect("/dashboard");
  return (
    <div className="card p-6">
      <h1 className="mb-2 text-lg font-semibold">This link has expired</h1>
      <p className="text-sm text-neutral-600">Request a new one from the <Link className="underline" href="/login">sign-in page</Link>.</p>
    </div>
  );
}
