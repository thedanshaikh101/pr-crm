// Response Desk demo data: themes, topics, conversations with notes, interview requests, statements with versions,
// activities and attachments. Runs once after the base seed; uses a fixed faker seed so output is stable.
import { faker } from "@faker-js/faker";
import type { SeedModule } from "./types";

const H = 36e5, D = 864e5;

export const seedResponseDesk: SeedModule = async (db, ctx) => {
  faker.seed(808);
  const a = ctx.accountId;
  const users = [ctx.ownerId, ctx.editorId];
  const now = Date.now();
  const at = (offsetMs: number) => new Date(now + offsetMs);
  const pickUser = () => faker.helpers.arrayElement(users);
  const contacts = await db.contact.findMany({ where: { accountId: a, deletedAt: null }, select: { id: true, organization: { select: { name: true } } }, take: 60 });
  const contact = () => faker.helpers.arrayElement(contacts);

  // Themes
  const themes = await Promise.all([["Reputation", "#B23B3B"], ["Product and clinics", "#2E7D4F"], ["Community", "#B8860B"]].map(([name, color]) =>
    db.theme.upsert({ where: { accountId_name: { accountId: a, name } }, create: { accountId: a, name, color }, update: { color } })));

  // Topics (the base seed already created "Sensory clinic opening"; attach it to a theme)
  await db.topic.updateMany({ where: { accountId: a, name: "Sensory clinic opening", themeId: null }, data: { themeId: themes[1].id, topicType: "Announcement" } });
  const topicSpecs = [
    { name: "Workplace burnout study", themeId: themes[1].id, topicType: "Campaign", status: "OPEN", ownerId: ctx.ownerId, description: "<p>Dr. Chen's study on nervous-system regulation and sick days. Key message: 31% fewer sick days across 1,200 employees. Do not speculate on causation beyond the paper.</p>" },
    { name: "Clinic wait times complaint", themeId: themes[0].id, topicType: "Issue", status: "OPEN", ownerId: ctx.editorId, description: "<p>A patient complaint about wait times at the Lumen sensory clinic surfaced on social media. Respond with empathy, point to the booking changes made in August.</p>" },
    { name: "Community champions 2026", themeId: themes[2].id, topicType: "Announcement", status: "MONITORING", ownerId: ctx.ownerId, description: "<p>Bridgeworks names its 2026 champions. Embargo lifts with the release; spokespeople are the executive director and two champions.</p>" },
    { name: "Data privacy question", themeId: themes[0].id, topicType: "Crisis", status: "MONITORING", ownerId: ctx.editorId, description: "<p>A trade reporter asked how the clinic stores intake data. Legal has cleared the holding line; escalate anything beyond it.</p>" },
    { name: "Spring wellness series", themeId: themes[2].id, topicType: "Campaign", status: "CLOSED", ownerId: ctx.ownerId, description: "<p>Closed. Spring series wrapped in June with 14 pieces of coverage.</p>" },
  ];
  const topics: { id: string; name: string }[] = [];
  for (const t of topicSpecs) {
    const existing = await db.topic.findFirst({ where: { accountId: a, name: t.name } });
    topics.push(existing ?? (await db.topic.create({ data: { accountId: a, ...t, status: t.status as any } })));
  }
  const topicIds = topics.map((t) => t.id);

  // Conversations
  const questions = [
    "Can you confirm the number of participants in the burnout study and whether any were self-employed?",
    "We are running a segment tonight on clinic wait times. Is anyone available for a 5:40pm live hit?",
    "Requesting a statement on the social media complaint about the sensory clinic. Deadline is end of day.",
    "Looking for a spokesperson to explain nervous-system regulation in plain language for a Monday feature.",
    "Is Dr. Chen available for a podcast recording next week? Thirty minutes, pre-recorded.",
    "Who are this year's community champions and can we get headshots before the embargo lifts?",
    "How does the clinic store intake data, and is it shared with any third party?",
    "Fact check: the release says 1,200 employees. Was that across one company or several?",
    "We would like to visit the clinic with a camera crew on Thursday morning. Is that possible?",
    "Can you send the full study PDF and the methodology appendix?",
    "Reader question for our advice column: what does a sensory clinic actually do?",
    "Following up on last week's request for a comment on workplace wellness spending.",
  ];
  const statuses = ["NEW", "NEW", "NEW", "IN_PROGRESS", "IN_PROGRESS", "IN_PROGRESS", "IN_PROGRESS", "RESPONDED", "RESPONDED", "RESPONDED", "CLOSED", "CLOSED"];
  const deadlines = [-26 * H, -3 * H, 2 * H, 5 * H, 20 * H, 1.5 * D, 3 * D, -2 * D, -1 * D, 2 * D, -6 * D, 6 * D];
  const channels = ["EMAIL", "PHONE", "EMAIL", "EMAIL", "EMAIL", "SOCIAL", "EMAIL", "EMAIL", "PHONE", "EMAIL", "OTHER", "EMAIL"];
  const caseTypes = ["Media enquiry", "Interview request", "Statement request", "Interview request", "Interview request", "Media enquiry", "Data request", "Media enquiry", "Media enquiry", "Data request", "Other", "Media enquiry"];
  const noteLines = ["Checked with the client; waiting on the exact figure.", "Called the desk back, they can move the slot by 20 minutes.", "Legal has seen the wording and is fine with it.", "Sent the PDF and the appendix.", "Reporter confirmed they received our reply.", "Flagging for Dana: this could turn into a bigger story."];
  const replies = ["<p>Thanks for reaching out. The study covered 1,200 employees across four organisations in Ontario. None were self-employed. Happy to connect you with Dr. Chen for anything further.</p>", "<p>Dr. Chen can join the Monday feature. She is free between 10am and noon; let us know which works.</p>", "<p>Attached are the full study and the methodology appendix. Please credit Lumen Wellness and Dr. Maya Chen.</p>"];
  const conversationIds: string[] = [];
  for (let i = 0; i < 12; i++) {
    const c = contact();
    const status = statuses[i];
    const received = at(-faker.number.int({ min: 2, max: 9 }) * D);
    const replied = status === "RESPONDED" || status === "CLOSED";
    const replyIndex = [7, 8, 9].indexOf(i);
    const conv = await db.conversation.create({ data: {
      accountId: a, topicId: faker.helpers.maybe(() => faker.helpers.arrayElement(topicIds), { probability: 0.7 }) ?? null, contactId: c.id, outletName: c.organization?.name ?? null,
      channel: channels[i] as any, caseType: caseTypes[i], receivedAt: received, deadline: at(deadlines[i]), question: questions[i], assigneeId: i % 4 === 3 ? null : users[i % 2],
      status: status as any, replySent: replyIndex >= 0 ? replies[replyIndex] : null, repliedAt: replied ? at(-faker.number.int({ min: 1, max: 30 }) * H) : null,
    } });
    conversationIds.push(conv.id);
    const notes: { body: string; authorId: string; createdAt: Date }[] = [];
    if (status !== "NEW") notes.push({ body: "[status] In progress (was New)", authorId: pickUser(), createdAt: new Date(received.getTime() + 2 * H) });
    if (replied) notes.push({ body: "[status] Responded (reply saved)", authorId: pickUser(), createdAt: new Date(received.getTime() + 8 * H) });
    if (status === "CLOSED") notes.push({ body: "[status] Closed (was Responded)", authorId: pickUser(), createdAt: new Date(received.getTime() + 30 * H) });
    for (const line of faker.helpers.arrayElements(noteLines, { min: 1, max: 2 })) notes.push({ body: line, authorId: pickUser(), createdAt: new Date(received.getTime() + faker.number.int({ min: 1, max: 20 }) * H) });
    await db.conversationNote.createMany({ data: notes.slice(0, 3).map((n) => ({ conversationId: conv.id, ...n })) });
  }

  // Interview requests
  const interviewSpecs = [
    { spokesperson: "Dr. Maya Chen", format: "LIVE", status: "REQUESTED", times: [2 * D + 17 * H, 3 * D + 17 * H] },
    { spokesperson: "Dr. Maya Chen", format: "PRE_RECORD", status: "PROPOSED", times: [4 * D + 10 * H, 5 * D + 14 * H, 6 * D + 9 * H] },
    { spokesperson: "Priya Nair, Lumen Wellness", format: "PHONE", status: "CONFIRMED", times: [1 * D + 11 * H, 2 * D + 15 * H] },
    { spokesperson: "Jordan Bell, Bridgeworks Foundation", format: "IN_PERSON", status: "COMPLETED", times: [-3 * D + 10 * H, -2 * D + 10 * H], outcome: "Went well. Segment aired the same evening; two follow-up questions handled by email." },
  ];
  for (const spec of interviewSpecs) {
    const c = contact();
    const proposed = spec.times.map((t) => at(t).toISOString());
    const confirmedAt = spec.status === "CONFIRMED" ? new Date(proposed[0]) : spec.status === "COMPLETED" ? new Date(proposed[1]) : null;
    const i = await db.interviewRequest.create({ data: { accountId: a, contactId: c.id, outletName: c.organization?.name ?? null, spokesperson: spec.spokesperson, format: spec.format as any, proposedTimes: proposed, confirmedAt, status: spec.status as any, outcome: spec.outcome ?? null } });
    if (spec.status === "CONFIRMED" && confirmedAt) {
      await db.calendarEvent.create({ data: { accountId: a, kind: "INTERVIEW", title: `Interview: ${spec.spokesperson} with ${c.organization?.name ?? "outlet"}`, startsAt: confirmedAt, endsAt: new Date(confirmedAt.getTime() + H), allDay: false, entityId: i.id } });
    }
  }

  // Statements with versions
  const statementSpecs = [
    { title: "Holding line: workplace burnout study", topicId: topicIds[0], status: "DRAFT", bodies: ["<p>Lumen Wellness welcomes interest in the study.</p>", "<p>Lumen Wellness welcomes interest in the study and will share the full methodology with any journalist who asks.</p>"] },
    { title: "Response: clinic wait times", topicId: topicIds[1], status: "IN_REVIEW", bodies: ["<p>We are sorry to hear about this experience.</p>", "<p>We are sorry to hear about this experience. Since August we have added evening appointments and a same-week triage line.</p>", "<p>We are sorry to hear about this experience. Since August we have added evening appointments and a same-week triage line, and we have reached out directly to the person who raised it.</p>"] },
    { title: "Community champions announcement", topicId: topicIds[2], status: "APPROVED", expires: 30 * D, bodies: ["<p>Bridgeworks Foundation is proud to name its 2026 community champions.</p>", "<p>Bridgeworks Foundation is proud to name its 2026 community champions, five people whose work has changed their neighbourhoods for the better. Full profiles are on our newsroom.</p>"] },
    { title: "Data handling statement (spring)", topicId: topicIds[3], status: "APPROVED", expires: -5 * D, bodies: ["<p>Intake data is stored in Canada and never sold.</p>", "<p>Intake data is stored in Canada, encrypted at rest, and never shared with third parties for marketing.</p>", "<p>Intake data is stored in Canada, encrypted at rest, and never shared with third parties. Patients can request deletion at any time.</p>"] },
  ];
  for (const spec of statementSpecs) {
    const body = spec.bodies[spec.bodies.length - 1];
    const approved = spec.status === "APPROVED";
    await db.statement.create({ data: {
      accountId: a, topicId: spec.topicId, title: spec.title, body, status: spec.status as any, approvedById: approved ? ctx.ownerId : null, approvedAt: approved ? at(-faker.number.int({ min: 1, max: 12 }) * D) : null,
      expiresAt: spec.expires !== undefined ? at(spec.expires) : null,
      versions: { create: spec.bodies.map((b, n) => ({ version: n + 1, body: b, savedById: users[n % 2], createdAt: at(-(spec.bodies.length - n) * D) })) },
    } });
  }

  // Activities
  const activitySpecs: { kind: string; title: string; entity?: string; entityId?: string; due: number; done?: boolean }[] = [
    { kind: "TASK", title: "Send study PDF and appendix", entity: "conversation", entityId: conversationIds[9], due: -1 * D, done: true },
    { kind: "CALL", title: "Call the assignment desk about the 5:40 hit", entity: "conversation", entityId: conversationIds[1], due: 1 * H },
    { kind: "EMAIL", title: "Confirm headshot usage rights with champions", entity: "topic", entityId: topicIds[2], due: 2 * D },
    { kind: "MEETING", title: "Prep session with Dr. Chen before the live", entity: "contact", entityId: contacts[0]?.id, due: 1 * D + 6 * H },
    { kind: "TASK", title: "Draft wait-times reply for legal review", entity: "conversation", entityId: conversationIds[2], due: -4 * H },
    { kind: "TASK", title: "Update the data handling statement", entity: "topic", entityId: topicIds[3], due: 3 * D },
    { kind: "EMAIL", title: "Thank the producer for the champions segment", entity: "contact", entityId: contacts[1]?.id, due: -2 * D, done: true },
    { kind: "CALL", title: "Check in with the podcast producer on dates", entity: "conversation", entityId: conversationIds[4], due: -12 * H, done: true },
  ];
  await db.activity.createMany({ data: activitySpecs.map((s, n) => ({
    accountId: a, kind: s.kind as any, title: s.title, body: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.5 }) ?? null, assigneeId: users[n % 2], dueAt: at(s.due),
    completedAt: s.done ? at(s.due - 3 * H) : null, entity: s.entityId ? s.entity ?? null : null, entityId: s.entityId ?? null, createdById: users[(n + 1) % 2],
  })) });

  // Attachments (use library assets when the library seeder ran first; otherwise minimal placeholder assets)
  let assets = await db.asset.findMany({ where: { accountId: a, deletedAt: null }, select: { id: true }, take: 4 });
  if (!assets.length) {
    assets = await Promise.all([1, 2].map((n) => db.asset.create({ data: { accountId: a, name: `RD attachment ${n}`, kind: n === 1 ? "pdf" : "image", externalUrl: `https://example.com/rd-attachment-${n}`, mime: n === 1 ? "application/pdf" : "image/png", size: 120_000 * n }, select: { id: true } })));
  }
  const asset = (n: number) => assets[n % assets.length].id;
  const statements = await db.statement.findMany({ where: { accountId: a }, select: { id: true }, take: 1 });
  const interviews = await db.interviewRequest.findMany({ where: { accountId: a }, select: { id: true }, take: 1 });
  await db.attachment.createMany({ data: [
    { accountId: a, assetId: asset(0), entity: "conversation", entityId: conversationIds[9], conversationId: conversationIds[9] },
    { accountId: a, assetId: asset(1), entity: "conversation", entityId: conversationIds[0], conversationId: conversationIds[0] },
    { accountId: a, assetId: asset(2), entity: "topic", entityId: topicIds[0] },
    ...(statements[0] ? [{ accountId: a, assetId: asset(3), entity: "statement", entityId: statements[0].id }] : []),
    ...(interviews[0] ? [{ accountId: a, assetId: asset(0), entity: "interview", entityId: interviews[0].id }] : []),
  ] });
};
