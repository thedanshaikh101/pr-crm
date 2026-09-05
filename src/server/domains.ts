"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireRole, requireViewer } from "@/lib/auth";
import { emailProvider } from "@/lib/email/provider";
import { emailDomain, isHostname } from "@/lib/email/domains";

const PATH = "/settings/domains";
const back = (msg: string, id?: string) => redirect(`${PATH}?${id ? `d=${id}&` : ""}msg=${encodeURIComponent(msg)}`);

export async function addDomain(fd: FormData) {
  const v = await requireViewer();
  requireRole(v, "ADMIN");
  const domain = String(fd.get("domain") ?? "").trim().toLowerCase();
  if (!isHostname(domain)) back("Enter a hostname such as news.example.com");
  const existing = await db.sendingDomain.findUnique({ where: { accountId_domain: { accountId: v.account.id, domain } } });
  if (existing) back("That domain is already added.", existing.id);
  let created: { providerId: string; records: { type: string; name: string; value: string }[] };
  try { created = await emailProvider().createDomain(domain); }
  catch (e) { back(`The email provider refused the domain: ${(e as Error).message}`); return; }
  const row = await db.sendingDomain.create({ data: { accountId: v.account.id, domain, providerId: created.providerId, dnsRecords: created.records.map((r) => ({ ...r, verified: false })) as any } });
  await audit(v.account.id, v.user.id, "domain.create", "sendingDomain", row.id, { domain });
  redirect(`${PATH}?d=${row.id}`);
}

export async function verifyDomain(id: string) {
  const v = await requireViewer();
  requireRole(v, "ADMIN");
  const d = await db.sendingDomain.findFirst({ where: { id, accountId: v.account.id } });
  if (!d) throw new Error("Domain not found");
  let ok = false, hint = "";
  try { ok = d.providerId ? await emailProvider().verifyDomain(d.providerId) : false; if (!ok) hint = "DNS records were not found yet. Changes can take up to an hour to propagate; check each record and try again."; }
  catch (e) { hint = (e as Error).message; }
  const records = ((d.dnsRecords as any[]) ?? []).map((r) => ({ ...r, verified: ok }));
  await db.sendingDomain.update({ where: { id }, data: { status: ok ? "VERIFIED" : "FAILED", verifiedAt: ok ? new Date() : d.verifiedAt, dnsRecords: records as any } });
  await audit(v.account.id, v.user.id, ok ? "domain.verified" : "domain.verify_failed", "sendingDomain", id, { hint });
  revalidatePath(PATH);
  back(ok ? `${d.domain} is verified.` : `Verification failed. ${hint}`, id);
}

export async function setDefaultFrom(id: string, fd: FormData) {
  const v = await requireViewer();
  requireRole(v, "ADMIN");
  const d = await db.sendingDomain.findFirst({ where: { id, accountId: v.account.id } });
  if (!d) throw new Error("Domain not found");
  const email = String(fd.get("defaultFrom") ?? "").trim().toLowerCase();
  if (email && emailDomain(email) !== d.domain) back(`The default from address must end with @${d.domain}`, id);
  await db.sendingDomain.update({ where: { id }, data: { defaultFrom: email || null } });
  await audit(v.account.id, v.user.id, "domain.default_from", "sendingDomain", id, { email });
  revalidatePath(PATH);
  back(email ? `Default from address saved.` : "Default from address cleared.", id);
}

export async function deleteDomain(id: string) {
  const v = await requireViewer();
  requireRole(v, "ADMIN");
  const d = await db.sendingDomain.findFirst({ where: { id, accountId: v.account.id } });
  if (!d) throw new Error("Domain not found");
  await db.sendingDomain.delete({ where: { id } });
  await audit(v.account.id, v.user.id, "domain.delete", "sendingDomain", id, { domain: d.domain });
  revalidatePath(PATH);
  back(`${d.domain} removed.`);
}
