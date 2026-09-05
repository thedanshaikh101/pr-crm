import Link from "next/link";

export function AdminNav({ current }: { current: "accounts" | "status" | "account" }) {
  const tab = (key: string, href: string, label: string) => (
    <Link href={href} className={`rounded px-2.5 py-1 text-sm ${current === key ? "bg-accentSoft text-accent" : "hover:bg-neutral-100"}`} aria-current={current === key ? "page" : undefined}>{label}</Link>
  );
  return (
    <nav aria-label="Super-admin" className="mb-4 flex items-center gap-1 border-b border-line pb-2">
      <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Super-admin</span>
      {tab("accounts", "/admin", "Accounts")}
      {tab("status", "/admin/status", "Status")}
    </nav>
  );
}
