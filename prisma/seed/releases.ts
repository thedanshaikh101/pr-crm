// Step 2 seed: boilerplates, versions, a newsletter with blocks, tracking rows, suppression, a scheduled distribution, tags.
import { faker } from "@faker-js/faker";
import type { SeedModule } from "./types";

const CODES = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const code = () => Array.from({ length: 10 }, () => CODES[faker.number.int({ min: 0, max: CODES.length - 1 })]).join("");

export const seedReleases: SeedModule = async (db, ctx) => {
  faker.seed(2026);
  const a = ctx.accountId;
  const releases = await db.release.findMany({ where: { accountId: a, kind: "PRESS_RELEASE" }, orderBy: { createdAt: "asc" } });
  if (!releases.length) return;
  const clients = await db.client.findMany({ where: { accountId: a }, orderBy: { name: "asc" } });
  const listByName = async (name: string, fallback: string | undefined) => (await db.list.findFirst({ where: { accountId: a, name }, select: { id: true } }))?.id ?? fallback;
  const campaignListId = await listByName("Fall campaign: Dr. Chen", ctx.listIds[2]);
  const columnistsListId = await listByName("Print columnists", ctx.listIds[3]);

  // Boilerplates: two client boilerplates, one footer, one media contact.
  const bp = await Promise.all([
    db.boilerplate.create({ data: { accountId: a, kind: "BOILERPLATE", clientId: clients[0]?.id, name: `About ${clients[0]?.name ?? "the client"}`, body: `<p><strong>About ${clients[0]?.name ?? "the client"}</strong></p><p>${faker.company.catchPhrase()}. ${faker.lorem.sentences(2)}</p>` } }),
    db.boilerplate.create({ data: { accountId: a, kind: "BOILERPLATE", clientId: clients[1]?.id, name: `About ${clients[1]?.name ?? "the client"}`, body: `<p><strong>About ${clients[1]?.name ?? "the client"}</strong></p><p>${faker.lorem.sentences(3)}</p>` } }),
    db.boilerplate.create({ data: { accountId: a, kind: "FOOTER", name: "Standard footer", isDefault: true, body: `<p>Northstar Communications · 120 Front St W, Toronto ON · <a href="https://northstar.example">northstar.example</a></p>` } }),
    db.boilerplate.create({ data: { accountId: a, kind: "MEDIA_CONTACT", name: "Dana Reyes (Northstar)", isDefault: true, body: `<p>Dana Reyes<br>Northstar Communications<br><a href="mailto:media@news.northstar.example">media@news.northstar.example</a><br>416 555 0199</p>` } }),
  ]);

  // Tags for releases.
  const tagGroup = await db.tagGroup.findFirst({ where: { accountId: a, name: "Campaign" } });
  const tags = await Promise.all(["Fall campaign", "Health", "Community"].map((name, i) => db.tag.upsert({ where: { accountId_name: { accountId: a, name } }, create: { accountId: a, groupId: tagGroup?.id, name, color: ["#B8860B", "#2E7D4F", "#1F5FBF"][i] }, update: {} })));

  for (const [i, r] of releases.entries()) {
    const boilerplate = r.clientId === clients[1]?.id ? bp[1] : bp[0];
    await db.release.update({ where: { id: r.id }, data: {
      boilerplateId: boilerplate.id, footerId: bp[2].id, mediaContactId: bp[3].id, subheadline: r.subheadline ?? faker.lorem.sentence({ min: 8, max: 14 }).replace(/\.$/, ""),
      body: `${r.body}<p>Read more at <a href="https://northstar.example/${faker.lorem.slug()}">northstar.example</a>.</p>`, updatedById: ctx.ownerId,
      tags: { create: [{ tagId: tags[i % 3].id }, ...(i === 0 ? [{ tagId: tags[1].id }] : [])] },
    } });
    await db.releaseVersion.create({ data: { releaseId: r.id, version: 1, savedById: ctx.ownerId, snapshot: { headline: r.headline, subheadline: r.subheadline, body: r.body, slug: r.slug, clientId: r.clientId, proactivity: r.proactivity, boilerplateId: boilerplate.id, footerId: bp[2].id } } });
  }
  // Second version for the DRAFT release.
  const draft = releases.find((r) => r.status === "DRAFT");
  if (draft) {
    await db.releaseVersion.create({ data: { releaseId: draft.id, version: 2, savedById: ctx.editorId, createdAt: new Date(Date.now() - 864e5), snapshot: { headline: draft.headline.replace(" (draft)", ""), subheadline: "What the research says about the first week of school", body: `<p>${faker.lorem.paragraphs(2, "</p><p>")}</p>`, slug: draft.slug, clientId: draft.clientId, proactivity: draft.proactivity, boilerplateId: bp[0].id, footerId: bp[2].id } } });
  }

  // Tracking rows and email events for the existing SENT distributions, consistent with recipient columns.
  const sentDists = await db.distribution.findMany({ where: { accountId: a, status: "SENT" }, include: { recipients: true } });
  for (const d of sentDists) {
    for (const rcp of d.recipients) {
      const at = d.startedAt ?? d.createdAt;
      const events: any[] = [{ recipientId: rcp.id, type: "SENT", createdAt: at }];
      if (rcp.deliveredAt) events.push({ recipientId: rcp.id, type: "DELIVERED", createdAt: rcp.deliveredAt });
      if (rcp.bouncedAt) events.push({ recipientId: rcp.id, type: "BOUNCED", createdAt: rcp.bouncedAt, meta: { bounceType: rcp.bounceType } });
      for (let k = 0; k < rcp.openCount; k++) events.push({ recipientId: rcp.id, type: "OPENED", createdAt: new Date((rcp.firstOpenAt ?? at).getTime() + k * 36e5) });
      const link = await db.trackedLink.create({ data: { code: code(), targetUrl: `https://northstar.example/${faker.lorem.slug()}`, recipientId: rcp.id, clicks: rcp.clickCount } });
      for (let k = 0; k < rcp.clickCount; k++) events.push({ recipientId: rcp.id, type: "CLICKED", url: link.targetUrl, createdAt: new Date((rcp.firstOpenAt ?? at).getTime() + 15 * 6e4) });
      if (rcp.repliedAt) events.push({ recipientId: rcp.id, type: "REPLIED", createdAt: rcp.repliedAt, meta: { subject: `Re: ${d.subject}`, excerpt: "Thanks, can you send the full report?" } });
      await db.emailEvent.createMany({ data: events });
    }
  }

  // Suppression for a bounced contact.
  const bounced = await db.contact.findFirst({ where: { accountId: a, emailStatus: "BOUNCED", email: { not: null } } });
  if (bounced?.email) await db.suppression.upsert({ where: { accountId_email: { accountId: a, email: bounced.email } }, create: { accountId: a, email: bounced.email, reason: "hard_bounce" }, update: {} });

  // Queued, scheduled distribution for the SCHEDULED release (6 days out).
  const scheduled = releases.find((r) => r.status === "SCHEDULED");
  if (scheduled) {
    const scheduledFor = new Date(Date.now() + 6 * 864e5);
    const listId = campaignListId;
    if (!listId) return;
    const members = await db.listMember.findMany({ where: { listId }, include: { contact: { include: { organization: true } } } });
    const d = await db.distribution.create({ data: { accountId: a, releaseId: scheduled.id, listId, label: "Launch morning send", status: "QUEUED", subject: scheduled.headline, preheader: "Embargoed until 6am ET", fromName: "Dana Reyes", fromEmail: "media@news.northstar.example", replyTo: "dana@northstar.example", intro: "<p>Hi {{first_name|there}}, sharing this ahead of the announcement in case it suits {{outlet}}.</p>", scheduledFor, sentById: ctx.ownerId, recipientCount: members.filter((m) => m.contact.email).length } });
    await db.distributionRecipient.createMany({ data: members.filter((m) => m.contact.email).map((m) => ({ distributionId: d.id, contactId: m.contactId, email: m.contact.email!.toLowerCase(), name: `${m.contact.firstName} ${m.contact.lastName}`, outlet: m.contact.organization?.name ?? null })), skipDuplicates: true });
    await db.release.update({ where: { id: scheduled.id }, data: { scheduledFor } });
    await db.releaseList.createMany({ data: [{ releaseId: scheduled.id, listId }], skipDuplicates: true });
  }

  // Newsletter with five blocks, LIVE, sent to "Print columnists".
  const live = releases.filter((r) => r.status === "LIVE");
  const publishedAt = new Date(Date.now() - 4 * 864e5);
  const blocks = [
    { id: "b1", type: "heading", text: "Northstar monthly: what our clients are talking about", level: 1 },
    { id: "b2", type: "text", html: `<p>Hi {{first_name|there}}, here is a quick round-up of this month's stories, with spokespeople available for interview this week.</p>` },
    { id: "b3", type: "release", releaseId: live[0]?.id ?? "" },
    { id: "b4", type: "release", releaseId: live[1]?.id ?? live[0]?.id ?? "" },
    { id: "b5", type: "button", label: "Visit the newsroom", href: "https://northstar.example/newsroom" },
  ];
  const nl = await db.release.create({ data: {
    accountId: a, kind: "NEWSLETTER", status: "LIVE", proactivity: "PROACTIVE", headline: "Northstar monthly: September stories and spokespeople", slug: "northstar-monthly-september", body: "", blocks,
    footerId: bp[2].id, createdById: ctx.ownerId, updatedById: ctx.ownerId, publishedAt, pageviews: 63, tags: { create: [{ tagId: tags[2].id }] },
    versions: { create: [{ version: 1, savedById: ctx.ownerId, snapshot: { headline: "Northstar monthly: September stories and spokespeople", blocks, slug: "northstar-monthly-september" } }] },
  } });
  const listId = columnistsListId;
  if (!listId) return;
  const members = await db.listMember.findMany({ where: { listId }, include: { contact: { include: { organization: true } } } });
  const nd = await db.distribution.create({ data: { accountId: a, releaseId: nl.id, listId, label: "September newsletter", status: "SENT", subject: nl.headline, fromName: "Dana Reyes", fromEmail: "media@news.northstar.example", sentById: ctx.ownerId, startedAt: publishedAt, completedAt: new Date(publishedAt.getTime() + 6e5), recipientCount: members.filter((m) => m.contact.email).length } });
  for (const m of members) {
    if (!m.contact.email) continue;
    const bouncedR = m.contact.emailStatus === "BOUNCED";
    const opened = !bouncedR && faker.datatype.boolean(0.55);
    const clicks = opened && faker.datatype.boolean(0.4) ? faker.number.int({ min: 1, max: 3 }) : 0;
    const firstOpenAt = opened ? faker.date.soon({ days: 2, refDate: publishedAt }) : null;
    const rcp = await db.distributionRecipient.create({ data: { distributionId: nd.id, contactId: m.contactId, email: m.contact.email.toLowerCase(), name: `${m.contact.firstName} ${m.contact.lastName}`, outlet: m.contact.organization?.name ?? null, providerMsgId: faker.string.uuid(), deliveredAt: bouncedR ? null : publishedAt, bouncedAt: bouncedR ? publishedAt : null, bounceType: bouncedR ? "hard" : null, firstOpenAt, openCount: opened ? faker.number.int({ min: 1, max: 4 }) : 0, clickCount: clicks } });
    const events: any[] = [{ recipientId: rcp.id, type: "SENT", createdAt: publishedAt }];
    if (!bouncedR) events.push({ recipientId: rcp.id, type: "DELIVERED", createdAt: publishedAt }); else events.push({ recipientId: rcp.id, type: "BOUNCED", createdAt: publishedAt });
    for (let k = 0; k < rcp.openCount; k++) events.push({ recipientId: rcp.id, type: "OPENED", createdAt: new Date(firstOpenAt!.getTime() + k * 36e5) });
    if (clicks) {
      const link = await db.trackedLink.create({ data: { code: code(), targetUrl: "https://northstar.example/newsroom", recipientId: rcp.id, clicks } });
      for (let k = 0; k < clicks; k++) events.push({ recipientId: rcp.id, type: "CLICKED", url: link.targetUrl, createdAt: new Date(firstOpenAt!.getTime() + 10 * 6e4) });
    }
    await db.emailEvent.createMany({ data: events });
  }
  await db.releaseList.createMany({ data: [{ releaseId: nl.id, listId }], skipDuplicates: true });
  console.log("Seeded step 2: boilerplates, versions, newsletter, tracking, scheduled distribution.");
};
