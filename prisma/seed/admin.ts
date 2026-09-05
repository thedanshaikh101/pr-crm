// Super-admin / cross-cutting demo data: a second account (with a high-bounce distribution so the
// admin table highlights it), RSS feeds and ContentItems on three demo contacts, feature flags on demo.
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import type { SeedModule } from "./types";

const RSS_FEEDS = ["https://www.cbc.ca/webfeed/rss/rss-topstories", "https://globalnews.ca/feed/", "https://www.thestar.com/search/?f=rss&t=article&l=25&s=start_time&sd=desc"];
const period = () => new Date().toISOString().slice(0, 7);

export const seedAdmin: SeedModule = async (db, ctx) => {
  faker.seed(4242);

  // --- demo account: feature flags, RSS feeds, content items
  await db.account.update({ where: { id: ctx.accountId }, data: { featureFlags: { newsletters: true, api: true, webhooks: true } } });
  const rssContacts = await db.contact.findMany({ where: { accountId: ctx.accountId, deletedAt: null }, orderBy: { createdAt: "asc" }, take: 3, select: { id: true } });
  for (let i = 0; i < rssContacts.length; i++) {
    const c = rssContacts[i];
    const feed = RSS_FEEDS[i % RSS_FEEDS.length];
    const host = new URL(feed).hostname.replace(/^www\./, "");
    await db.contact.update({ where: { id: c.id }, data: { rssUrl: feed } });
    for (let j = 0; j < 2; j++) {
      const slug = faker.lorem.slug();
      const url = `https://${host}/news/${slug}`;
      const exists = await db.contentItem.findFirst({ where: { contactId: c.id, url } });
      if (!exists) await db.contentItem.create({ data: { contactId: c.id, title: faker.lorem.sentence({ min: 6, max: 11 }).replace(/\.$/, ""), url, publishedAt: faker.date.recent({ days: 20 }), source: "rss" } });
    }
  }

  // --- second account
  if (await db.account.findUnique({ where: { slug: "second-agency" } })) return;
  const owner = await db.user.upsert({
    where: { email: "owner2@pressdesk.local" },
    create: { email: "owner2@pressdesk.local", name: "Priya Natarajan", passwordHash: await bcrypt.hash("demo-password-1", 10), emailVerifiedAt: new Date(), lastSignInAt: faker.date.recent({ days: 3 }) },
    update: {},
  });
  const account = await db.account.create({ data: {
    name: "Second Agency", slug: "second-agency", plan: "STARTER", billingInterval: "month", subscriptionStatus: "active", currentPeriodEnd: new Date(Date.now() + 20 * 864e5),
    createdAt: faker.date.past({ years: 1 }),
    memberships: { create: { userId: owner.id, role: "OWNER", jobTitle: "Principal" } },
    tagGroups: { create: [{ name: "Client" }, { name: "Campaign" }, { name: "Topic" }] },
    newsroom: { create: { primaryColor: "#2E7D4F" } },
    sendingDomains: { create: { domain: "mail.second-agency.example", status: "PENDING", defaultFrom: "news@mail.second-agency.example", dnsRecords: [{ type: "TXT", name: "mail.second-agency.example", value: "v=spf1 include:example.net ~all", verified: false }] } },
    usage: { create: { period: period(), emailsSent: 140 } },
  } });
  const a = account.id;
  const org = await db.organization.create({ data: { accountId: a, name: "Ottawa Citizen", domain: "ottawacitizen.com", website: "https://ottawacitizen.com", domainAuthority: 78, classifications: ["Newspaper - Regional"], audienceLocation: ["Ottawa", "Ontario"], language: "English" } });
  const contacts: { id: string; email: string | null; firstName: string; lastName: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const first = faker.person.firstName(), last = faker.person.lastName();
    contacts.push(await db.contact.create({ data: {
      accountId: a, organizationId: org.id, firstName: first, lastName: last, jobTitle: faker.helpers.arrayElement(["Reporter", "City Editor", "Columnist", "Producer"]),
      email: `${first}.${last}@ottawacitizen.com`.toLowerCase(), emailStatus: i < 3 ? "BOUNCED" : "VALID", classifications: ["Newspaper - Regional"], audienceLocation: ["Ottawa"], language: "English",
      ownerId: owner.id, searchText: `${first} ${last} Ottawa Citizen`,
    } }));
  }
  const list = await db.list.create({ data: { accountId: a, name: "Ottawa reporters", ownerId: owner.id, editedById: owner.id, members: { create: contacts.map((c) => ({ contactId: c.id })) } } });
  const client = await db.client.create({ data: { accountId: a, name: "Riverside Housing Co-op", color: "#2E7D4F" } });
  const rel = async (headline: string, daysAgo: number) => db.release.create({ data: {
    accountId: a, clientId: client.id, headline, slug: headline.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60), status: "LIVE", proactivity: "PROACTIVE",
    datelineCity: "OTTAWA", datelineDate: new Date(Date.now() - daysAgo * 864e5), publishedAt: new Date(Date.now() - daysAgo * 864e5), body: `<p>${faker.lorem.paragraphs(2, "</p><p>")}</p>`, createdById: owner.id, pageviews: faker.number.int({ min: 10, max: 300 }),
  } });
  const r1 = await rel("Riverside Housing Co-op breaks ground on 120 affordable units", 12);
  const r2 = await rel("Co-op residents to open community kitchen this fall", 4);
  // Distribution 1: healthy. Distribution 2: high bounce rate plus one complaint, so /admin flags this account.
  const mk = async (releaseId: string, publishedAt: Date, bounceIds: Set<string>, complainId: string | null) => {
    const d = await db.distribution.create({ data: { accountId: a, releaseId, listId: list.id, subject: "News from Riverside", fromName: "Priya Natarajan", fromEmail: "news@mail.second-agency.example", sentById: owner.id, status: "SENT", recipientCount: contacts.length, startedAt: publishedAt, completedAt: publishedAt, createdAt: publishedAt } });
    for (const c of contacts) {
      const bounced = bounceIds.has(c.id);
      await db.distributionRecipient.create({ data: { distributionId: d.id, contactId: c.id, email: c.email!, name: `${c.firstName} ${c.lastName}`, outlet: org.name, providerMsgId: faker.string.uuid(),
        deliveredAt: bounced ? null : publishedAt, bouncedAt: bounced ? publishedAt : null, bounceType: bounced ? "hard" : null, complainedAt: c.id === complainId ? publishedAt : null,
        firstOpenAt: !bounced && faker.datatype.boolean(0.5) ? faker.date.soon({ days: 1, refDate: publishedAt }) : null, openCount: bounced ? 0 : faker.number.int({ min: 0, max: 3 }) } });
    }
    return d;
  };
  await mk(r1.id, r1.publishedAt!, new Set(), null);
  await mk(r2.id, r2.publishedAt!, new Set(contacts.slice(0, 3).map((c) => c.id)), contacts[4].id);
  await db.suppression.createMany({ data: contacts.slice(0, 3).map((c) => ({ accountId: a, email: c.email!, reason: "hard_bounce" })), skipDuplicates: true });
  await db.auditLog.createMany({ data: [
    { accountId: a, userId: owner.id, action: "release.publish", entity: "release", entityId: r1.id, createdAt: r1.publishedAt! },
    { accountId: a, userId: owner.id, action: "distribution.send", entity: "distribution", createdAt: r2.publishedAt! },
    { accountId: a, userId: null, action: "webhook.delivery_failed", entity: "webhook", meta: { url: "https://hooks.example.invalid/pressdesk", status: 502 }, createdAt: faker.date.recent({ days: 1 }) },
  ] });
};
