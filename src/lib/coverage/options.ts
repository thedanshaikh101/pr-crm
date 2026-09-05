// Select options for the coverage form. Server-only (uses the DB); not a server action.
import { db } from "@/lib/db";

export async function loadFormOptions(accountId: string) {
  const [clients, releases, orgs, contacts, tags] = await Promise.all([
    db.client.findMany({ where: { accountId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.release.findMany({ where: { accountId, deletedAt: null }, select: { id: true, headline: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.organization.findMany({ where: { accountId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 1000 }),
    db.contact.findMany({ where: { accountId, deletedAt: null }, select: { id: true, firstName: true, lastName: true, organization: { select: { name: true } } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 2000 }),
    db.tag.findMany({ where: { accountId }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    clients, tags,
    releases: releases.map((r: any) => ({ id: r.id, name: r.headline })),
    orgs,
    contacts: contacts.map((c: any) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim() + (c.organization ? ` (${c.organization.name})` : "") })),
  };
}
