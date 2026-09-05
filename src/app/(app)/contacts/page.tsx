import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeFilterCount, buildContactWhere, DEFAULT_COLUMNS, orderFor, parseFilters, toQuery } from "@/lib/contacts/filters";
import { FilterDrawer } from "@/components/contacts/FilterDrawer";
import { ContactTable } from "@/components/contacts/ContactTable";
import { ListToolbar } from "@/components/ListToolbar";

export default async function ContactsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const v = await requireViewer();
  const f = parseFilters(searchParams);
  const where = buildContactWhere(f, v.account.id, v.user.id);
  const [total, rows, orgs, lists, tags, teammates, subjects, layout, savedViews] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({
      where, orderBy: orderFor(f.sort), skip: (f.page - 1) * f.per, take: f.per,
      include: { organization: { select: { id: true, name: true, domainAuthority: true } }, subjects: { include: { subject: true } }, listMembers: { include: { list: { select: { id: true, name: true } } } } },
    }),
    db.organization.findMany({ where: { accountId: v.account.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    db.list.findMany({ where: { accountId: v.account.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.tag.findMany({ where: { accountId: v.account.id }, select: { id: true, name: true, color: true } }),
    db.membership.findMany({ where: { accountId: v.account.id, deactivatedAt: null }, include: { user: { select: { id: true, name: true } } } }),
    db.subject.findMany({ orderBy: { path: "asc" }, select: { id: true, path: true, parentId: true } }),
    db.columnLayout.findUnique({ where: { userId_screen: { userId: v.user.id, screen: "contacts" } } }),
    db.savedView.findMany({ where: { accountId: v.account.id, screen: "contacts", OR: [{ userId: v.user.id }, { shared: true }] } }),
  ]);
  const columns = (layout?.columns as typeof DEFAULT_COLUMNS | undefined) ?? DEFAULT_COLUMNS;
  const from = total ? (f.page - 1) * f.per + 1 : 0;
  const to = Math.min(total, f.page * f.per);
  const pages = Math.max(1, Math.ceil(total / f.per));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{f.mine ? "My Contacts" : "Media Contacts"}</h1>
        <div className="flex gap-2">
          <Link href="/contacts/imports/new" className="btn">Import</Link>
          <Link href="/contacts/new" className="btn btn-primary">Add contact</Link>
        </div>
      </div>

      <ListToolbar
        screen="contacts"
        q={f.q ?? ""}
        filterCount={activeFilterCount(f)}
        view={f.view}
        total={total}
        from={from}
        to={to}
        page={f.page}
        pages={pages}
        per={f.per}
        basePath="/contacts" query={toQuery(f)}
        resetHref="/contacts"
        columns={columns}
        savedViews={savedViews.map((s: any) => ({ id: s.id, name: s.name, params: s.params }))}
        currentQuery={toQuery(f)}
        drawer={<FilterDrawer f={f} orgs={orgs} lists={lists} tags={tags} teammates={teammates.map((m: any) => m.user)} subjects={subjects} />}
      />

      <ContactTable
        rows={rows.map((c: any) => ({
          id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), outlet: c.organization?.name ?? null, orgId: c.organization?.id ?? null,
          jobTitle: c.jobTitle, xBio: c.xBio, xFollowers: c.xFollowers, classifications: c.classifications, email: c.email, emailStatus: c.emailStatus,
          landline: c.landline, mobile: c.mobile, audienceLocation: c.audienceLocation, domainAuthority: c.organization?.domainAuthority ?? null,
          significantUpdate: c.significantUpdate, isEx: c.isExJournalist,
          subjects: c.subjects.map((s: any) => s.subject.path), lists: c.listMembers.map((m: any) => m.list),
        }))}
        columns={columns}
        view={f.view}
        lists={lists}
      />

      {!total && (
        <div className="card mt-4 p-10 text-center">
          <p className="mb-1 font-medium">{activeFilterCount(f) || f.q ? "No contacts match these filters." : "No contacts yet."}</p>
          <p className="mb-4 text-sm text-neutral-600">{activeFilterCount(f) || f.q ? "Loosen a filter or clear the search." : "Import a CSV from your media database, or add people one at a time."}</p>
          {!(activeFilterCount(f) || f.q) && <Link href="/contacts/imports/new" className="btn btn-primary">Import contacts</Link>}
        </div>
      )}

      <Link href="/contacts/new" className="fixed bottom-6 right-6 grid h-12 w-12 place-items-center rounded-full bg-accent text-2xl text-white shadow-lg" aria-label="Add contact">+</Link>
    </div>
  );
}
