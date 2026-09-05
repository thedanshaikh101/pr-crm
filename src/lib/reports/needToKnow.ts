// Pure Word document builder for the daily Need to Know report (docx package). The route collects the data.
import { AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, HeadingLevel, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

export type NeedToKnowData = {
  accountName: string;
  generatedAt: Date;
  since: Date;
  emails: { delivered: number; opened: number; replied: number; bounced?: number };
  coverage: { outlet: string; headline: string; url: string | null; sentiment?: string }[];
  conversations: { outlet: string | null; question: string; deadline: Date | null; status?: string }[];
  upcomingReleases: { headline: string; scheduledFor: Date | null; client?: string | null; url?: string | null }[];
  tasks: { title: string; dueAt: Date | null; assignee: string | null; overdue: boolean }[];
  teamActivity: { name: string; count: number }[];
};

const ACCENT = "1F5FBF";
const fmtDateTime = (d: Date | null | undefined) => (d ? d.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "");
const fmtDate = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-CA", { dateStyle: "medium" }) : "");

const h1 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)], spacing: { before: 240, after: 120 } });
const h2 = (text: string, n?: number) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(n === undefined ? text : `${text} (${n})`)], spacing: { before: 240, after: 80 } });
const p = (text: string, opts: { muted?: boolean; italics?: boolean } = {}) => new Paragraph({ children: [new TextRun({ text, color: opts.muted ? "6B7280" : undefined, italics: opts.italics })], spacing: { after: 80 } });
const bullet = (children: (TextRun | ExternalHyperlink)[]) => new Paragraph({ bullet: { level: 0 }, children, spacing: { after: 40 } });
const link = (text: string, url: string) => new ExternalHyperlink({ link: url, children: [new TextRun({ text, style: "Hyperlink" })] });
const empty = (text: string) => p(text, { muted: true, italics: true });

function numbersTable(rows: [string, string | number][]) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "E3E4E0" };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new Table({
    width: { size: 60, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: [
        new TableCell({ borders, shading: { type: ShadingType.CLEAR, fill: "E7EEFB", color: "auto" }, width: { size: 70, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Metric", bold: true })] })] }),
        new TableCell({ borders, shading: { type: ShadingType.CLEAR, fill: "E7EEFB", color: "auto" }, width: { size: 30, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Last 24 hours", bold: true })] })] }),
      ] }),
      ...rows.map(([k, val]) => new TableRow({ children: [
        new TableCell({ borders, children: [new Paragraph({ children: [new TextRun(k)] })] }),
        new TableCell({ borders, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun(String(val))] })] }),
      ] })),
    ],
  });
}

export function buildNeedToKnowDoc(d: NeedToKnowData): Document {
  const children: (Paragraph | Table)[] = [];
  children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun("Need to Know")] }));
  children.push(p(`${d.accountName}. Covering ${fmtDateTime(d.since)} to ${fmtDateTime(d.generatedAt)}.`, { muted: true }));

  children.push(h1("The numbers"));
  const totalCoverage = d.coverage.length;
  const rows: [string, string | number][] = [
    ["Emails delivered", d.emails.delivered], ["Emails opened", d.emails.opened], ["Replies received", d.emails.replied],
    ...(d.emails.bounced !== undefined ? ([["Bounces", d.emails.bounced]] as [string, number][]) : []),
    ["Coverage logged", totalCoverage], ["New conversations", d.conversations.length], ["Releases in the next 7 days", d.upcomingReleases.length], ["Tasks due today or overdue", d.tasks.length],
  ];
  children.push(numbersTable(rows));

  children.push(h2("Coverage logged", d.coverage.length));
  if (!d.coverage.length) children.push(empty("No coverage was logged in the last 24 hours."));
  for (const c of d.coverage) {
    const parts: (TextRun | ExternalHyperlink)[] = [new TextRun({ text: `${c.outlet}: `, bold: true })];
    parts.push(c.url ? link(c.headline, c.url) : new TextRun(c.headline));
    if (c.sentiment) parts.push(new TextRun({ text: ` (${c.sentiment.toLowerCase()})`, color: "6B7280" }));
    children.push(bullet(parts));
  }

  children.push(h2("New conversations", d.conversations.length));
  if (!d.conversations.length) children.push(empty("No new enquiries came in."));
  for (const c of d.conversations) {
    const q = c.question.length > 160 ? c.question.slice(0, 159).trimEnd() + "…" : c.question;
    children.push(bullet([
      new TextRun({ text: `${c.outlet ?? "Unknown outlet"}: `, bold: true }), new TextRun(q),
      new TextRun({ text: c.deadline ? ` Deadline ${fmtDateTime(c.deadline)}.` : " No deadline given.", color: "B8860B" }),
    ]));
  }

  children.push(h2("Upcoming releases, next 7 days", d.upcomingReleases.length));
  if (!d.upcomingReleases.length) children.push(empty("Nothing scheduled this week."));
  for (const r of d.upcomingReleases) {
    children.push(bullet([
      new TextRun({ text: `${fmtDateTime(r.scheduledFor)}: `, bold: true }), r.url ? link(r.headline, r.url) : new TextRun(r.headline),
      ...(r.client ? [new TextRun({ text: ` (${r.client})`, color: "6B7280" })] : []),
    ]));
  }

  children.push(h2("Tasks due today or overdue", d.tasks.length));
  if (!d.tasks.length) children.push(empty("Nothing due. Good work."));
  for (const t of d.tasks) {
    children.push(bullet([
      new TextRun({ text: t.overdue ? "Overdue: " : "Today: ", bold: true, color: t.overdue ? "B23B3B" : undefined }), new TextRun(t.title),
      new TextRun({ text: `${t.dueAt ? ` (due ${fmtDate(t.dueAt)}` : " ("}${t.assignee ? `${t.dueAt ? ", " : ""}${t.assignee}` : ""})`, color: "6B7280" }),
    ]));
  }

  children.push(h2("Team activity"));
  if (!d.teamActivity.length) children.push(empty("No recorded activity in the last 24 hours."));
  for (const t of d.teamActivity) children.push(bullet([new TextRun({ text: `${t.name}: `, bold: true }), new TextRun(`${t.count} action${t.count === 1 ? "" : "s"}`)]));

  return new Document({
    creator: "Pressdesk",
    title: `Need to Know - ${d.accountName}`,
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { size: 48, bold: true, color: ACCENT }, paragraph: { spacing: { after: 120 } } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, color: "1C1F26" } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, color: ACCENT } },
      ],
    },
    sections: [{
      properties: {},
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: `${d.accountName} · Need to Know · generated ${fmtDateTime(d.generatedAt)} · page `, color: "6B7280", size: 18 }),
          new TextRun({ children: [PageNumber.CURRENT], color: "6B7280", size: 18 }),
        ] })] }),
      },
      children,
    }],
  });
}
