import Link from "next/link";
const PAGES = [["/settings/team", "Team Management"], ["/settings/me", "My Settings"], ["/settings/signature", "My Contact Information"], ["/settings/tags", "Tag Groups"], ["/settings/pick-lists", "Case Types and Topic Types"], ["/settings/classifications", "Contact Classifications"], ["/settings/boilerplates", "Email Footers & Boilerplates"], ["/settings/domains", "Sending Domains"], ["/settings/newsroom", "Newsroom"], ["/settings/billing", "Billing"], ["/settings/api", "API keys and Webhooks"], ["/settings/gdpr", "GDPR Data Clean"], ["/settings/deleted", "Deleted Items"], ["/help", "Help"]];
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
      <nav className="card self-start p-2" aria-label="Settings">{PAGES.map(([h, l]) => <Link key={h} href={h} className="block rounded px-2 py-1.5 text-sm hover:bg-neutral-100">{l}</Link>)}</nav>
      <div>{children}</div>
    </div>
  );
}
