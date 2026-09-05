// Step 6 demo data: client logos, an API key, a webhook endpoint with deliveries, pick lists,
// classifications, tags, recycle-bin rows and boilerplates. Idempotent on a fresh DB.
import { createHash } from "crypto";
import { faker } from "@faker-js/faker";
import type { SeedModule } from "./types";

export const DEMO_API_KEY = "pd_live_demo0000000000000000000000000000"; // 32 chars after the prefix
const PICKLISTS = {
  case_type: ["Media enquiry", "Interview request", "Statement request", "Correction", "Complaint", "FOI"],
  topic_type: ["Announcement", "Crisis", "Campaign", "Issue", "Event", "Ongoing"],
};
const SYSTEM_CLASSIFICATIONS = ["Television", "Radio", "Newspaper - National", "Newspaper - Regional", "Publications - Consumer (B2C)", "Publications - Trade (B2B)", "Podcast", "Blog", "News Source (syndicated news & wires)", "Freelancer", "Online", "In Between Roles"];

export const seedSettings: SeedModule = async (db, ctx) => {
  faker.seed(606);
  const a = ctx.accountId;
  const daysAgo = (d: number) => new Date(Date.now() - d * 864e5);

  // Client logos (only where empty)
  const clients = await db.client.findMany({ where: { accountId: a }, orderBy: { name: "asc" } });
  for (const [i, c] of clients.entries()) if (!c.logoUrl) await db.client.update({ where: { id: c.id }, data: { logoUrl: `https://picsum.photos/seed/client${i + 1}/200/200` } });

  // API key (deterministic plaintext so the log is useful)
  const keyHash = createHash("sha256").update(DEMO_API_KEY).digest("hex");
  await db.apiKey.upsert({ where: { keyHash }, create: { accountId: a, name: "Demo integration", keyHash, prefix: DEMO_API_KEY.slice(0, 12), lastUsedAt: daysAgo(2) }, update: {} });
  console.log(`API key: ${DEMO_API_KEY}`);

  // Webhook endpoint with three deliveries
  let ep = await db.webhookEndpoint.findFirst({ where: { accountId: a, url: "https://example.com/pressdesk-hook" } });
  if (!ep) {
    ep = await db.webhookEndpoint.create({ data: { accountId: a, url: "https://example.com/pressdesk-hook", events: ["release.published", "coverage.created"], secret: "whsec_demo00000000000000000000000000000", createdAt: daysAgo(20) } });
    await db.webhookDelivery.createMany({ data: [
      { endpointId: ep.id, event: "release.published", payload: { releaseId: ctx.releaseIds[0], headline: "New study links workplace nervous-system regulation to 31% fewer sick days" }, status: 200, attempts: 1, nextRetryAt: null, createdAt: daysAgo(9) },
      { endpointId: ep.id, event: "coverage.created", payload: { coverageId: faker.string.uuid(), outlet: "CBC News" }, status: 500, attempts: 2, nextRetryAt: new Date(Date.now() + 30 * 60_000), createdAt: daysAgo(1) },
      { endpointId: ep.id, event: "release.published", payload: { releaseId: ctx.releaseIds[1], headline: "Lumen Wellness opens Toronto's first accessible sensory clinic" }, status: null, attempts: 0, nextRetryAt: new Date(), createdAt: new Date() },
    ] });
  }

  // Pick lists
  for (const [kind, names] of Object.entries(PICKLISTS)) await db.pickListItem.createMany({ data: names.map((name) => ({ accountId: a, kind, name })), skipDuplicates: true });

  // Classifications: system defaults if missing, plus two account-specific ones
  if ((await db.classification.count({ where: { accountId: null } })) === 0) await db.classification.createMany({ data: SYSTEM_CLASSIFICATIONS.map((name) => ({ accountId: null, name })) });
  for (const name of ["Newsletter", "Trade association"]) await db.classification.upsert({ where: { accountId_name: { accountId: a, name } }, create: { accountId: a, name }, update: {} });

  // Tags in Campaign and Topic groups
  const groups = await db.tagGroup.findMany({ where: { accountId: a } });
  const gid = (n: string) => groups.find((g) => g.name === n)?.id ?? null;
  const tagSpecs: [string, string, string | null][] = [
    ["Fall 2026 launch", "#B23B3B", gid("Campaign")], ["Sensory clinic opening", "#2E7D4F", gid("Campaign")], ["Community champions", "#B8860B", gid("Campaign")],
    ["Mental health", "#1F5FBF", gid("Topic")], ["Workplace", "#6B4FBB", gid("Topic")], ["Accessibility", "#0E7C86", gid("Topic")], ["Parenting", "#C2410C", gid("Topic")],
  ];
  const tagIds: string[] = [];
  for (const [name, color, groupId] of tagSpecs) {
    const t = await db.tag.upsert({ where: { accountId_name: { accountId: a, name } }, create: { accountId: a, name, color, groupId }, update: { color, groupId } });
    tagIds.push(t.id);
  }
  await db.contactTag.createMany({ data: faker.helpers.arrayElements(ctx.contactIds, 30).map((contactId, i) => ({ contactId, tagId: tagIds[i % tagIds.length] })), skipDuplicates: true });
  await db.releaseTag.createMany({ data: ctx.releaseIds.slice(0, 3).map((releaseId, i) => ({ releaseId, tagId: tagIds[i] })), skipDuplicates: true });

  // Recycle bin: 4 soft-deleted contacts and 1 soft-deleted list
  const live = await db.contact.findMany({ where: { accountId: a, deletedAt: null }, select: { id: true }, orderBy: { createdAt: "desc" }, take: 60 });
  const binIds = faker.helpers.arrayElements(live.map((c) => c.id), 4);
  await db.contact.updateMany({ where: { id: { in: binIds }, accountId: a }, data: { deletedAt: daysAgo(3) } });
  if (!(await db.list.findFirst({ where: { accountId: a, name: "Old holiday gift guide list" } }))) {
    await db.list.create({ data: { accountId: a, name: "Old holiday gift guide list", ownerId: ctx.ownerId, editedById: ctx.ownerId, deletedAt: daysAgo(3), members: { create: faker.helpers.arrayElements(live.map((c) => c.id), 6).map((contactId) => ({ contactId })) } } });
  }

  // Boilerplates: only add names that do not exist yet (the releases seeder may have added some)
  const existing = new Set((await db.boilerplate.findMany({ where: { accountId: a }, select: { name: true } })).map((b) => b.name));
  const bps: { kind: "BOILERPLATE" | "FOOTER" | "MEDIA_CONTACT"; name: string; clientId: string | null; isDefault: boolean; body: string }[] = [
    { kind: "BOILERPLATE", name: "About Northstar Communications", clientId: null, isDefault: true, body: "<p><strong>About Northstar Communications</strong></p><p>Northstar is a Toronto public relations agency for founders, clinicians and non-profits who have something worth saying. We place stories, not ads.</p>" },
    { kind: "BOILERPLATE", name: "About Lumen Wellness", clientId: ctx.clientIds[1] ?? null, isDefault: true, body: "<p><strong>About Lumen Wellness</strong></p><p>Lumen Wellness runs accessible, sensory-aware clinics in the Greater Toronto Area, combining occupational therapy with nervous-system education.</p>" },
    { kind: "BOILERPLATE", name: "About Dr. Maya Chen", clientId: ctx.clientIds[0] ?? null, isDefault: true, body: "<p><strong>About Dr. Maya Chen</strong></p><p>Dr. Maya Chen is a workplace health researcher and speaker whose work on nervous-system regulation has been covered by national broadcasters.</p>" },
    { kind: "FOOTER", name: "Standard footer", clientId: null, isDefault: true, body: "<p>Northstar Communications, 401 Richmond St W, Toronto ON. You are receiving this because you cover this beat. <a href=\"{{unsubscribe_url}}\">Unsubscribe</a>.</p>" },
    { kind: "FOOTER", name: "Minimal footer", clientId: null, isDefault: false, body: "<p>Sent by Northstar Communications. <a href=\"{{unsubscribe_url}}\">Unsubscribe</a></p>" },
    { kind: "MEDIA_CONTACT", name: "Dana Reyes (agency)", clientId: null, isDefault: true, body: "<p><strong>Media contact</strong><br/>Dana Reyes, Northstar Communications<br/>media@news.northstar.example · 416 555 0148</p>" },
    { kind: "MEDIA_CONTACT", name: "Lumen Wellness press office", clientId: ctx.clientIds[1] ?? null, isDefault: true, body: "<p><strong>Media contact</strong><br/>Priya Nair, Lumen Wellness<br/>press@lumenwellness.example</p>" },
  ];
  for (const b of bps) if (!existing.has(b.name)) await db.boilerplate.create({ data: { accountId: a, ...b } });
  const defaultBp = await db.boilerplate.findFirst({ where: { accountId: a, kind: "BOILERPLATE", clientId: ctx.clientIds[1] ?? "" } });
  if (defaultBp && ctx.clientIds[1]) await db.client.update({ where: { id: ctx.clientIds[1] }, data: { defaultBoilerplateId: defaultBp.id } });

  console.log("Seeded settings: api key, webhook endpoint, pick lists, classifications, tags, recycle bin, boilerplates");
};
