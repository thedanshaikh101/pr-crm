// Demo account with realistic fake data so the app looks alive on first run.
// npm run db:seed   -> login demo@pressdesk.local / demo-password-1
import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
faker.seed(42);

const OUTLETS = [
  ["CBC News", "cbc.ca", 92, "Television", "DAILY"], ["CTV News", "ctvnews.ca", 89, "Television", "DAILY"], ["Global News", "globalnews.ca", 88, "Television", "DAILY"],
  ["Toronto Star", "thestar.com", 90, "Newspaper - National", "DAILY"], ["The Globe and Mail", "theglobeandmail.com", 91, "Newspaper - National", "DAILY"],
  ["CityNews Toronto", "toronto.citynews.ca", 80, "Television", "DAILY"], ["CP24", "cp24.com", 82, "Television", "CONTINUOUS"], ["Breakfast Television", "bt.citynews.ca", 70, "Television", "DAILY"],
  ["Toronto Life", "torontolife.com", 78, "Publications - Consumer (B2C)", "MONTHLY"], ["Canadian Immigrant", "canadianimmigrant.ca", 55, "Publications - Consumer (B2C)", "MONTHLY"],
  ["TVO", "tvo.org", 76, "Television", "DAILY"], ["The Canadian Press", "thecanadianpress.com", 85, "News Source (syndicated news & wires)", "CONTINUOUS"],
  ["Chatelaine", "chatelaine.com", 72, "Publications - Consumer (B2C)", "MONTHLY"], ["Zoomer Radio", "zoomerradio.ca", 50, "Radio", "DAILY"], ["The Big Story Podcast", "thebigstorypodcast.ca", 45, "Podcast", "DAILY"],
] as const;
const SUBJECTS = ["News > National News", "News > Local News", "Health > Mental Health", "Health > Wellness & Nutrition", "Lifestyle > Disability", "Lifestyle > Family & Parenting", "Business > Small Business", "Business > Workplace", "People > Immigration", "People > Indigenous peoples", "Sport > Hockey", "Arts > Books"];
const TITLES = ["Producer", "Senior Producer", "Assignment Editor", "Reporter", "Health Reporter", "Columnist", "Host", "Chase Producer", "Digital Editor", "Freelance Writer", "Lifestyle Editor"];

async function main() {
  const existing = await db.account.findUnique({ where: { slug: "demo" } });
  if (existing) { console.log("Demo account already exists; skipping."); return; }

  const [owner, editor] = await Promise.all([
    db.user.create({ data: { email: "demo@pressdesk.local", name: "Dana Reyes", passwordHash: await bcrypt.hash("demo-password-1", 10), emailVerifiedAt: new Date(), isSuperAdmin: true, lastSignInAt: new Date() } }),
    db.user.create({ data: { email: "sam@pressdesk.local", name: "Sam Okafor", passwordHash: await bcrypt.hash("demo-password-1", 10), emailVerifiedAt: new Date() } }),
  ]);
  const account = await db.account.create({ data: {
    name: "Northstar Communications", slug: "demo", plan: "AGENCY", trialEndsAt: null,
    memberships: { create: [{ userId: owner.id, role: "OWNER", jobTitle: "Founder" }, { userId: editor.id, role: "EDITOR", jobTitle: "Account Manager" }] },
    tagGroups: { create: [{ name: "Client" }, { name: "Campaign" }, { name: "Topic" }] },
    newsroom: { create: { primaryColor: "#1F5FBF" } },
    sendingDomains: { create: { domain: "news.northstar.example", status: "VERIFIED", verifiedAt: new Date(), defaultFrom: "media@news.northstar.example" } },
  } });
  const a = account.id;

  const subjectIds: Record<string, string> = {};
  for (const path of SUBJECTS) {
    const [parent, child] = path.split(" > ");
    const p = await db.subject.upsert({ where: { path: parent }, create: { name: parent, path: parent }, update: {} });
    const c = await db.subject.upsert({ where: { path }, create: { name: child, path, parentId: p.id }, update: {} });
    subjectIds[path] = c.id;
  }

  const clients = await Promise.all(["Dr. Maya Chen", "Lumen Wellness", "Bridgeworks Foundation"].map((name, i) => db.client.create({ data: { accountId: a, name, color: ["#1F5FBF", "#2E7D4F", "#B8860B"][i] } })));
  const tagGroup = await db.tagGroup.findFirst({ where: { accountId: a, name: "Client" } });
  await Promise.all(clients.map((c) => db.tag.create({ data: { accountId: a, groupId: tagGroup!.id, name: c.name, color: c.color } })));

  const orgs = await Promise.all(OUTLETS.map(([name, domain, da, cls, freq]) => db.organization.create({ data: { accountId: a, name, website: `https://${domain}`, domain, domainAuthority: da, classifications: [cls], frequency: freq as any, audienceLocation: ["Canada", "Ontario", "Toronto"], language: "English", newsroomEmail: `news@${domain}` } })));

  const contacts: string[] = [];
  for (let i = 0; i < 180; i++) {
    const org = faker.helpers.arrayElement(orgs);
    const first = faker.person.firstName(), last = faker.person.lastName();
    const subs = faker.helpers.arrayElements(SUBJECTS, { min: 1, max: 3 });
    const c = await db.contact.create({ data: {
      accountId: a, organizationId: org.id, firstName: first, lastName: last, jobTitle: faker.helpers.arrayElement(TITLES),
      email: faker.helpers.maybe(() => `${first}.${last}@${org.domain}`.toLowerCase(), { probability: 0.85 }) ?? null,
      emailStatus: faker.helpers.weightedArrayElement([{ weight: 6, value: "VALID" }, { weight: 3, value: "UNVERIFIED" }, { weight: 1, value: "BOUNCED" }]) as any,
      xHandle: faker.internet.username({ firstName: first, lastName: last }).toLowerCase(), xFollowers: faker.number.int({ min: 200, max: 60000 }),
      xBio: `${faker.helpers.arrayElement(TITLES)} at ${org.name}. ${faker.company.catchPhrase()}. Tips: DM open.`,
      classifications: org.classifications, audienceLocation: ["Toronto", "Ontario"], physicalLocation: faker.helpers.arrayElement(["Toronto, ON", "Ottawa, ON", "Hamilton, ON", "Vancouver, BC", "Montreal, QC"]), language: "English",
      importance: faker.helpers.arrayElement(["NOT_RANKED", "LOW", "MEDIUM", "HIGH", "VIP"]) as any, ownerId: faker.helpers.arrayElement([owner.id, editor.id]),
      isExJournalist: faker.datatype.boolean(0.05), landline: faker.helpers.maybe(() => faker.phone.number({ style: "national" }), { probability: 0.4 }) ?? null,
      searchText: `${first} ${last} ${org.name}`, subjects: { create: subs.map((s) => ({ subjectId: subjectIds[s] })) },
      updatedAt: faker.date.recent({ days: 60 }),
    } });
    contacts.push(c.id);
  }

  const lists = await Promise.all([
    ["Toronto TV producers", "cls=Television&aud=Toronto", true], ["Health and wellness reporters", "subject=Health", true], ["Fall campaign: Dr. Chen", "", false], ["Print columnists", "", false],
  ].map(([name, q, smart]) => db.list.create({ data: { accountId: a, name: name as string, isSmart: smart as boolean, smartFilter: smart ? { query: q } : undefined, ownerId: owner.id, editedById: owner.id } })));
  await db.listMember.createMany({ data: faker.helpers.arrayElements(contacts, 40).map((contactId) => ({ listId: lists[2].id, contactId })) });
  await db.listMember.createMany({ data: faker.helpers.arrayElements(contacts, 25).map((contactId) => ({ listId: lists[3].id, contactId })) });

  const releases = await Promise.all([
    ["New study links workplace nervous-system regulation to 31% fewer sick days", "LIVE", -20], ["Lumen Wellness opens Toronto's first accessible sensory clinic", "LIVE", -9],
    ["Bridgeworks Foundation names 2026 community champions", "SCHEDULED", 6], ["Back-to-school anxiety: what parents get wrong (draft)", "DRAFT", 0],
  ].map(([headline, status, dayOffset], i) => db.release.create({ data: {
    accountId: a, clientId: clients[i % 3].id, headline: headline as string, slug: (headline as string).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60), status: status as any, proactivity: "PROACTIVE",
    datelineCity: "TORONTO", datelineDate: new Date(Date.now() + (dayOffset as number) * 864e5), body: `<p>${faker.lorem.paragraphs(3, "</p><p>")}</p>`, createdById: owner.id,
    publishedAt: status === "LIVE" ? new Date(Date.now() + (dayOffset as number) * 864e5) : null, scheduledFor: status === "SCHEDULED" ? new Date(Date.now() + (dayOffset as number) * 864e5) : null, pageviews: status === "LIVE" ? faker.number.int({ min: 40, max: 900 }) : 0,
  } })));

  for (const r of releases.filter((x) => x.status === "LIVE")) {
    const list = lists[2];
    const members = await db.listMember.findMany({ where: { listId: list.id }, include: { contact: true } });
    const d = await db.distribution.create({ data: { accountId: a, releaseId: r.id, listId: list.id, subject: r.headline, fromName: "Dana Reyes", fromEmail: "media@news.northstar.example", sentById: owner.id, status: "SENT", recipientCount: members.length, startedAt: r.publishedAt!, completedAt: r.publishedAt! } });
    for (const m of members) {
      if (!m.contact.email) continue;
      const bounced = m.contact.emailStatus === "BOUNCED";
      const opened = !bounced && faker.datatype.boolean(0.45);
      await db.distributionRecipient.create({ data: { distributionId: d.id, contactId: m.contactId, email: m.contact.email, name: `${m.contact.firstName} ${m.contact.lastName}`, outlet: "", providerMsgId: faker.string.uuid(),
        deliveredAt: bounced ? null : r.publishedAt, bouncedAt: bounced ? r.publishedAt : null, bounceType: bounced ? "hard" : null, firstOpenAt: opened ? faker.date.soon({ days: 2, refDate: r.publishedAt! }) : null, openCount: opened ? faker.number.int({ min: 1, max: 5 }) : 0, clickCount: opened && faker.datatype.boolean(0.3) ? 1 : 0, repliedAt: opened && faker.datatype.boolean(0.1) ? faker.date.soon({ days: 3, refDate: r.publishedAt! }) : null } });
    }
    await db.usageCounter.upsert({ where: { accountId_period: { accountId: a, period: new Date().toISOString().slice(0, 7) } }, create: { accountId: a, period: new Date().toISOString().slice(0, 7), emailsSent: members.length }, update: { emailsSent: { increment: members.length } } });
  }

  for (let i = 0; i < 14; i++) {
    const org = faker.helpers.arrayElement(orgs);
    await db.coverage.create({ data: { accountId: a, clientId: faker.helpers.arrayElement(clients).id, releaseId: faker.helpers.maybe(() => releases[0].id, { probability: 0.5 }), organizationId: org.id, contactId: faker.helpers.arrayElement(contacts),
      outletName: org.name, headline: faker.lorem.sentence({ min: 6, max: 12 }).replace(/\.$/, ""), url: `https://${org.domain}/${faker.lorem.slug()}`, publishedAt: faker.date.recent({ days: 45 }),
      type: faker.helpers.arrayElement(["BROADCAST", "ONLINE", "PRINT", "RADIO", "PODCAST"]) as any, focus: faker.helpers.arrayElement(["NATIONAL", "REGIONAL", "LOCAL"]) as any, sentiment: faker.helpers.weightedArrayElement([{ weight: 7, value: "POSITIVE" }, { weight: 2, value: "NEUTRAL" }, { weight: 1, value: "NEGATIVE" }]) as any,
      summary: faker.lorem.sentence(), estimatedReach: faker.number.int({ min: 5000, max: 900000 }), pickupCount: faker.number.int({ min: 0, max: 6 }), createdById: owner.id } });
  }

  const topic = await db.topic.create({ data: { accountId: a, name: "Sensory clinic opening", status: "OPEN", ownerId: owner.id } });
  await db.conversation.createMany({ data: [
    { accountId: a, topicId: topic.id, contactId: contacts[3], outletName: orgs[0].name, channel: "EMAIL", question: "Can we get a spokesperson for a 6pm live hit on the clinic opening?", deadline: new Date(Date.now() + 6 * 36e5), status: "NEW", assigneeId: editor.id },
    { accountId: a, contactId: contacts[9], outletName: orgs[3].name, channel: "PHONE", question: "Looking for data on sick days and nervous-system programs for a Monday feature.", deadline: new Date(Date.now() + 2 * 864e5), status: "IN_PROGRESS", assigneeId: owner.id },
  ] });
  await db.statement.create({ data: { accountId: a, topicId: topic.id, title: "Holding statement: clinic accessibility", body: "Lumen Wellness is committed to…", status: "APPROVED", approvedById: owner.id, approvedAt: new Date() } });
  await db.activity.createMany({ data: [
    { accountId: a, kind: "TASK", title: "Follow up with CP24 assignment desk on Monday hit", assigneeId: owner.id, dueAt: new Date(Date.now() + 864e5), createdById: owner.id },
    { accountId: a, kind: "CALL", title: "Prep call with Dr. Chen before Global segment", assigneeId: editor.id, dueAt: new Date(Date.now() + 2 * 864e5), createdById: owner.id },
  ] });
  await db.calendarEvent.createMany({ data: [
    { accountId: a, kind: "AWARENESS_DAY", title: "World Mental Health Day", startsAt: new Date(new Date().getFullYear(), 9, 10) },
    { accountId: a, kind: "RELEASE", title: releases[2].headline, startsAt: releases[2].scheduledFor!, entityId: releases[2].id, clientId: clients[2].id },
  ] });
  for (let i = 0; i < 40; i++) await db.auditLog.create({ data: { accountId: a, userId: faker.helpers.arrayElement([owner.id, editor.id]), action: faker.helpers.arrayElement(["contact.update", "list.add_members", "release.publish", "coverage.create"]), createdAt: faker.date.recent({ days: 10 }) } });

  console.log("Seeded demo account. Sign in: demo@pressdesk.local / demo-password-1");
}

main().finally(() => db.$disconnect());
