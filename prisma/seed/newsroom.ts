// Step 3 seed: newsroom settings, library folders and assets, release attachments, pageviews.
import { faker } from "@faker-js/faker";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { SeedModule } from "./types";
import { newStorageKey, putObject } from "../../src/lib/storage";

async function tinyPdf(title: string, lines: string[]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText(title, { x: 60, y: 720, size: 22, font });
  lines.forEach((l, i) => page.drawText(l, { x: 60, y: 680 - i * 20, size: 12, font }));
  return Buffer.from(await doc.save());
}

export const seedNewsroom: SeedModule = async (db, ctx) => {
  faker.seed(303);
  const a = ctx.accountId;

  await db.newsroomSettings.upsert({
    where: { accountId: a },
    create: { accountId: a },
    update: {
      primaryColor: "#1F5FBF", fontFamily: "Inter",
      logoUrl: "https://picsum.photos/seed/pressdesk-logo/240/80",
      headerImageUrl: "https://picsum.photos/seed/pressdesk/1200/300",
      aboutHtml: "<p>Northstar Communications is a Toronto public relations agency working with health, wellness and community organizations. We help experts reach the reporters and producers who cover their fields, and we keep the newsroom stocked with releases, statements and assets you can use.</p><p>Media are welcome to reproduce any material in this newsroom with attribution.</p>",
      mediaContactHtml: "<p><strong>Dana Reyes</strong><br>Founder, Northstar Communications<br><a href=\"mailto:media@news.northstar.example\">media@news.northstar.example</a><br>+1 416 555 0142</p>",
      mediaKitHtml: "<p>Logos and headshots may be used in editorial coverage without further permission. Please credit photographers where noted and do not alter logos. Contact us for print-resolution files.</p>",
      footerHtml: "<p>Northstar Communications, 120 Adelaide St W, Toronto ON. Media enquiries: <a href=\"mailto:media@news.northstar.example\">media@news.northstar.example</a></p>",
      socials: { website: "https://northstar.example", x: "https://x.com/northstarcomms", linkedin: "https://www.linkedin.com/company/northstar-communications", instagram: "https://instagram.com/northstarcomms" },
      showSearch: true, showRss: true,
    },
  });

  const [logos, headshots, kits] = await Promise.all(["Logos", "Headshots", "Press kits"].map((name) => db.folder.create({ data: { accountId: a, name } })));

  const external = [
    { name: "Northstar logo (colour).png", kind: "logo", folderId: logos.id, url: "https://picsum.photos/seed/northstar-logo/800/300", w: 800, h: 300, tags: ["brand"], kit: true },
    { name: "Lumen Wellness logo.png", kind: "logo", folderId: logos.id, url: "https://picsum.photos/seed/lumen-logo/800/300", w: 800, h: 300, tags: ["brand", "lumen wellness"], kit: true },
    { name: "Dr. Maya Chen headshot.jpg", kind: "headshot", folderId: headshots.id, url: "https://picsum.photos/seed/maya-chen/900/1200", w: 900, h: 1200, tags: ["dr. maya chen", "headshot"], kit: true },
    { name: "Sensory clinic opening day.jpg", kind: "image", folderId: null, url: "https://picsum.photos/seed/clinic-opening/1600/1000", w: 1600, h: 1000, tags: ["lumen wellness", "event"], kit: false },
  ];
  const assets: { id: string }[] = [];
  for (const e of external) {
    assets.push(await db.asset.create({ data: { accountId: a, folderId: e.folderId, name: e.name, kind: e.kind, externalUrl: e.url, mime: e.name.endsWith(".png") ? "image/png" : "image/jpeg", size: faker.number.int({ min: 120_000, max: 2_400_000 }), width: e.w, height: e.h, tags: e.tags, inMediaKit: e.kit } }));
  }

  const pdfs = [
    { name: "Northstar press kit 2026.pdf", lines: ["Who we are, who we represent, and how to reach us.", "Toronto, Canada", "media@news.northstar.example"], kit: true, tags: ["press kit"] },
    { name: "Workplace regulation study summary.pdf", lines: ["Key findings: 31% fewer sick days across 1,200 employees.", "Methodology and full tables available on request.", "Prepared for Dr. Maya Chen"], kit: false, tags: ["dr. maya chen", "research"] },
  ];
  for (const p of pdfs) {
    const bytes = await tinyPdf(p.name.replace(/\.pdf$/, ""), p.lines);
    const key = newStorageKey(a, "assets", p.name);
    await putObject(key, bytes, "application/pdf");
    assets.push(await db.asset.create({ data: { accountId: a, folderId: kits.id, name: p.name, kind: "pdf", storageKey: key, mime: "application/pdf", size: bytes.length, tags: p.tags, inMediaKit: p.kit } }));
  }

  const bio = Buffer.from("Dr. Maya Chen is a workplace health researcher and physician based in Toronto. Her work on nervous-system regulation in high-pressure workplaces has been covered by CBC, the Globe and Mail and Chatelaine. She is available for interviews on burnout, sick leave and practical stress tools for teams.\n", "utf8");
  const bioKey = newStorageKey(a, "assets", "maya-chen-bio.txt");
  await putObject(bioKey, bio, "text/plain");
  assets.push(await db.asset.create({ data: { accountId: a, folderId: kits.id, name: "Dr. Maya Chen bio.txt", kind: "bio", storageKey: bioKey, mime: "text/plain", size: bio.length, tags: ["dr. maya chen", "bio"], inMediaKit: false } }));

  assets.push(await db.asset.create({ data: { accountId: a, folderId: null, name: "Clinic tour (b-roll)", kind: "video_link", externalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", tags: ["lumen wellness", "b-roll"], inMediaKit: true } }));

  // Attach two assets to each LIVE release and log a month of pageviews.
  const live = await db.release.findMany({ where: { accountId: a, status: "LIVE", deletedAt: null }, select: { id: true, publishedAt: true } });
  const pairs = [[assets[2], assets[5]], [assets[1], assets[4]], [assets[0], assets[7]]];
  for (let i = 0; i < live.length; i++) {
    const pair = pairs[i % pairs.length];
    await db.releaseAsset.createMany({ data: pair.map((x) => ({ releaseId: live[i].id, assetId: x.id })), skipDuplicates: true });
  }

  // Tags on live releases so the topic sidebar and tag pages have something to show.
  const topicGroup = await db.tagGroup.findFirst({ where: { accountId: a, name: "Topic" } });
  const tagNames = ["Workplace health", "Accessibility", "Research"];
  const tags = [];
  for (const name of tagNames) tags.push(await db.tag.upsert({ where: { accountId_name: { accountId: a, name } }, create: { accountId: a, groupId: topicGroup?.id, name, color: "#2E7D4F" }, update: {} }));
  for (let i = 0; i < live.length; i++) {
    const pick = i % 2 === 0 ? [tags[0], tags[2]] : [tags[1]];
    await db.releaseTag.createMany({ data: pick.map((t) => ({ releaseId: live[i].id, tagId: t.id })), skipDuplicates: true });
  }

  if (live.length) {
    const uas = ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 Chrome/126.0 Safari/537.36", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/127.0"];
    const refs = [null, "https://www.google.com/", "https://t.co/", "https://www.linkedin.com/", "https://news.ycombinator.com/"];
    await db.newsroomPageview.createMany({ data: Array.from({ length: 30 }, () => ({
      releaseId: faker.helpers.arrayElement(live).id,
      referrer: faker.helpers.arrayElement(refs),
      ua: faker.helpers.arrayElement(uas),
      createdAt: faker.date.recent({ days: 30 }),
    })) });
  }
};

export default seedNewsroom;
