import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function OrganizationsPage({ searchParams }: { searchParams: { q?: string } }) {
  const v = await requireViewer();
  const q = searchParams.q ?? "";
  const orgs = await db.organization.findMany({ where: { accountId: v.account.id, deletedAt: null, name: q ? { contains: q, mode: "insensitive" } : undefined }, include: { _count: { select: { contacts: true } } }, orderBy: { name: "asc" }, take: 500 });
  return (
    <div>
      <h1 className="mb-3 text-xl font-semibold">Organizations</h1>
      <form className="mb-3 max-w-md"><input name="q" className="input" defaultValue={q} placeholder="Find an outlet" /></form>
      <div className="card overflow-x-auto"><table className="data"><thead><tr><th>Outlet</th><th>People</th><th>Classification</th><th>DA</th><th>Frequency</th><th>Audience</th></tr></thead>
        <tbody>{orgs.map((o: any) => <tr key={o.id}><td><Link href={`/organizations/${o.id}`} className="font-medium hover:underline">{o.name}</Link></td><td>{o._count.contacts}</td><td>{o.classifications.join(", ")}</td><td>{o.domainAuthority ?? ""}</td><td className="capitalize">{o.frequency?.toLowerCase() ?? ""}</td><td>{o.audienceLocation.join(", ")}</td></tr>)}</tbody></table></div>
    </div>
  );
}
