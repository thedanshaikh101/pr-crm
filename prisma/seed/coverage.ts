// Coverage and Planning demo data: six months of coverage with pickups and tags, calendar events, client logos.
import type { SeedModule } from "./types";
import { faker } from "@faker-js/faker";
import { awarenessDaysFor } from "../../src/lib/planning/awarenessDays";

const HEADLINES = [
  "Workplace wellness program cuts sick days by a third, study finds", "Toronto clinic opens with sensory-friendly rooms for neurodivergent patients", "Why nervous-system regulation is the next frontier for HR",
  "Foundation names community champions for 2026", "How one wellness startup is rethinking accessible care", "Back-to-school anxiety: an expert's three tips for parents",
  "Small business owners are burning out. Here is what helps", "Mental Health Week: the case for quiet rooms at work", "Q&A: Dr. Maya Chen on stress, sleep and the modern office",
  "A new kind of clinic opens its doors downtown", "Community champions honoured at annual gala", "Local charity launches mentorship program for newcomers",
  "The science of calm: inside a Toronto lab", "Employers turn to nervous-system training to keep staff", "Sensory clinic sees demand double in first month",
  "Five workplace habits that quietly wreck your sleep", "Wellness clinic wins accessibility award", "Foundation report: youth mentorship pays off",
  "Panel: what the sick-day study means for Ontario employers", "Morning show: reset your nervous system in five minutes", "Podcast: the future of accessible health care",
  "Radio: parents call in with back-to-school worries", "Column: the quiet cost of always-on work culture", "Feature: the clinic that designed for sensory needs first",
  "National desk: workplace health study draws federal interest", "Trade: HR leaders weigh in on regulation programs", "Lifestyle: the calm office, explained",
  "Newcomer mentorship expands to three cities", "Editorial: accessible care should be the default", "Watch: inside the new sensory clinic",
];

export const seedCoverage: SeedModule = async (db, ctx) => {
  faker.seed(4242);
  const a = ctx.accountId;
  const orgs = await db.organization.findMany({ where: { accountId: a }, select: { id: true, name: true, domain: true } });
  const clients = await db.client.findMany({ where: { accountId: a } });
  const releases = await db.release.findMany({ where: { accountId: a }, select: { id: true, clientId: true } });
  const tagGroups = await db.tagGroup.findMany({ where: { accountId: a } });
  const topicGroup = tagGroups.find((g: any) => g.name === "Topic") ?? tagGroups[0];
  const campaignGroup = tagGroups.find((g: any) => g.name === "Campaign") ?? tagGroups[0];

  // Client logos, only where none is set.
  for (const [i, c] of clients.entries()) if (!c.logoUrl) await db.client.update({ where: { id: c.id }, data: { logoUrl: `https://picsum.photos/seed/client${i + 1}/200/200` } });

  // Tags for coverage.
  const tagNames: [string, string, string | undefined][] = [["Mental health", "#2E7D4F", topicGroup?.id], ["Accessibility", "#1F5FBF", topicGroup?.id], ["Workplace", "#B8860B", topicGroup?.id], ["Fall 2026 campaign", "#7C3AED", campaignGroup?.id], ["Award", "#B23B3B", undefined]];
  const tags = [] as { id: string }[];
  for (const [name, color, groupId] of tagNames) tags.push(await db.tag.upsert({ where: { accountId_name: { accountId: a, name } }, create: { accountId: a, name, color, groupId }, update: {} }));

  const now = new Date();
  const parents: { id: string; headline: string; releaseId: string | null; clientId: string | null }[] = [];
  for (let i = 0; i < 30; i++) {
    const org = faker.helpers.arrayElement(orgs);
    const client = clients[i % clients.length];
    const link = i % 2 === 0 ? (releases.find((r: any) => r.clientId === client.id) ?? releases[0]) : null;
    const type = faker.helpers.weightedArrayElement([{ weight: 5, value: "ONLINE" }, { weight: 3, value: "BROADCAST" }, { weight: 2, value: "PRINT" }, { weight: 1, value: "RADIO" }, { weight: 1, value: "PODCAST" }, { weight: 1, value: "SOCIAL" }]);
    const publishedAt = new Date(now.getTime() - faker.number.int({ min: 1, max: 180 }) * 864e5 - faker.number.int({ min: 0, max: 20 }) * 36e5);
    const c = await db.coverage.create({ data: {
      accountId: a, clientId: client.id, releaseId: link?.id ?? null, organizationId: org.id, contactId: faker.helpers.maybe(() => faker.helpers.arrayElement(ctx.contactIds), { probability: 0.6 }) ?? null,
      outletName: org.name, headline: HEADLINES[i], url: `https://${org.domain}/${faker.helpers.slugify(HEADLINES[i].toLowerCase()).slice(0, 50)}-${1000 + i}`,
      publishedAt, type: type as any, focus: faker.helpers.weightedArrayElement([{ weight: 4, value: "NATIONAL" }, { weight: 3, value: "REGIONAL" }, { weight: 3, value: "LOCAL" }, { weight: 1, value: "TRADE" }, { weight: 1, value: "INTERNATIONAL" }]) as any,
      sentiment: faker.helpers.weightedArrayElement([{ weight: 6, value: "POSITIVE" }, { weight: 3, value: "NEUTRAL" }, { weight: 1, value: "NEGATIVE" }]) as any,
      summary: faker.lorem.sentences(2), notes: faker.helpers.maybe(() => `Pitched by ${faker.person.firstName()}. ${faker.lorem.sentence()}`, { probability: 0.4 }) ?? null,
      estimatedReach: faker.number.int({ min: 4000, max: 1200000 }), adValue: faker.helpers.maybe(() => faker.number.int({ min: 500, max: 45000 }), { probability: 0.6 }) ?? null,
      imageUrl: i % 3 === 0 ? `https://picsum.photos/seed/cov${i}/400/240` : null, createdById: i % 4 === 0 ? ctx.editorId : ctx.ownerId, createdAt: publishedAt,
      tags: { create: faker.helpers.arrayElements(tags, { min: 0, max: 2 }).map((t) => ({ tagId: t.id })) },
    } });
    parents.push({ id: c.id, headline: c.headline, releaseId: c.releaseId, clientId: c.clientId });
  }

  // Pickups: 8 children spread across the first few parents.
  const pickupParents = [parents[0], parents[0], parents[0], parents[1], parents[1], parents[2], parents[4], parents[7]];
  for (const [i, p] of pickupParents.entries()) {
    const org = orgs[(i * 3 + 1) % orgs.length];
    await db.coverage.create({ data: { accountId: a, parentId: p.id, clientId: p.clientId, releaseId: p.releaseId, organizationId: org.id, outletName: org.name, headline: p.headline, url: `https://${org.domain}/syndicated/${2000 + i}`, publishedAt: new Date(now.getTime() - faker.number.int({ min: 1, max: 60 }) * 864e5), type: "ONLINE", focus: "REGIONAL", sentiment: "POSITIVE", estimatedReach: faker.number.int({ min: 2000, max: 90000 }), createdById: ctx.ownerId } });
  }
  for (const p of parents) {
    const n = await db.coverage.count({ where: { parentId: p.id, deletedAt: null } });
    await db.coverage.update({ where: { id: p.id }, data: { pickupCount: n } });
  }

  // Calendar: awareness days for this year, embargoes, coverage moments, an interview.
  const year = now.getFullYear();
  const wanted = ["Bell Let's Talk Day", "International Women's Day", "World Health Day", "Mental Health Week begins", "National Indigenous Peoples Day", "Canada Day", "World Mental Health Day"];
  const existing = await db.calendarEvent.findMany({ where: { accountId: a, kind: "AWARENESS_DAY" }, select: { title: true, startsAt: true } });
  const days = awarenessDaysFor(year).filter((d) => wanted.includes(d.title) && !existing.some((e: any) => e.title === d.title && e.startsAt.getTime() === d.date.getTime()));
  const at = (dayOffset: number, hour = 9) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, 0, 0); return d; };
  await db.calendarEvent.createMany({ data: [
    ...days.map((d) => ({ accountId: a, kind: "AWARENESS_DAY" as const, title: d.title, startsAt: d.date, allDay: true })),
    { accountId: a, kind: "EMBARGO", title: "Embargo: sick-day study results", startsAt: at(3, 0), endsAt: at(5, 0), allDay: true, clientId: clients[0]?.id, color: "#B23B3B" },
    { accountId: a, kind: "EMBARGO", title: "Embargo: champions announcement", startsAt: at(12, 0), allDay: true, clientId: clients[2]?.id },
    { accountId: a, kind: "COVERAGE_MOMENT", title: "Breakfast Television segment airs", startsAt: at(2, 7), endsAt: at(2, 8), allDay: false, clientId: clients[1]?.id },
    { accountId: a, kind: "COVERAGE_MOMENT", title: "Toronto Life feature online", startsAt: at(9, 0), allDay: true, clientId: clients[1]?.id },
    { accountId: a, kind: "INTERVIEW", title: "Dr. Chen live with CP24", startsAt: at(1, 17), endsAt: at(1, 18), allDay: false, clientId: clients[0]?.id },
  ] });
};

export default seedCoverage;
