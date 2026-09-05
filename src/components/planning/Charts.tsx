"use client";
import { useRef } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Brand palette (tailwind.config.ts) plus two extra hues so six coverage types stay distinguishable; order validated for CVD.
export const PALETTE = { accent: "#1F5FBF", good: "#2E7D4F", warn: "#B8860B", bad: "#B23B3B", ink: "#1C1F26", muted: "#6B7280", line: "#E3E4E0", violet: "#7C3AED", cyan: "#0891B2" };
export const TYPE_COLORS: Record<string, string> = { BROADCAST: PALETTE.accent, ONLINE: PALETTE.warn, PRINT: PALETTE.good, RADIO: PALETTE.violet, PODCAST: PALETTE.bad, SOCIAL: PALETTE.cyan };
export const SENTIMENT_COLORS: Record<string, string> = { POSITIVE: PALETTE.good, NEUTRAL: PALETTE.warn, NEGATIVE: PALETTE.bad };

export type Series = {
  emailsPerWeek: { week: string; sent: number }[];
  openRate: { label: string; rate: number; sent: number; opened: number }[];
  coverageByType: ({ week: string } & Record<string, number | string>)[];
  types: string[];
  sentiment: { name: string; value: number }[];
  reach: { week: string; reach: number; cumulative: number }[];
  contactsPerWeek: { week: string; added: number }[];
  releasesPerMonth: { month: string; published: number }[];
};

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const shortWeek = (k: string) => { const d = new Date(k + "T00:00:00"); return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" }); };
const shortMonth = (k: string) => { const d = new Date(k + "-01T00:00:00"); return d.toLocaleDateString("en-CA", { month: "short", year: "2-digit" }); };

function download(name: string, blob: Blob) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [keys.map(esc).join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n") + "\n";
}
function svgToPng(svg: SVGSVGElement, name: string) {
  const rect = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(rect.width)); clone.setAttribute("height", String(rect.height));
  clone.style.fontFamily = "Inter, system-ui, sans-serif";
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  const scale = 2;
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = rect.width * scale; canvas.height = rect.height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
    canvas.toBlob((b) => { if (b) download(name, b); }, "image/png");
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
}

function Card({ title: t, sub, rows, slug, empty, children }: { title: string; sub?: string; rows: Record<string, unknown>[]; slug: string; empty: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <section className="card p-4" ref={ref}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div><h2 className="text-sm font-semibold">{t}</h2>{sub && <p className="text-xs text-neutral-500">{sub}</p>}</div>
        <div className="flex gap-1">
          <button type="button" className="btn px-2 py-0.5 text-xs" disabled={empty} onClick={() => { const svg = ref.current?.querySelector("svg.recharts-surface") as SVGSVGElement | null; if (svg) svgToPng(svg, `${slug}.png`); }} aria-label={`Download ${t} as PNG`}>PNG</button>
          <button type="button" className="btn px-2 py-0.5 text-xs" disabled={empty} onClick={() => download(`${slug}.csv`, new Blob([toCsv(rows)], { type: "text/csv" }))} aria-label={`Download ${t} as CSV`}>CSV</button>
        </div>
      </div>
      {empty ? <div className="grid h-56 place-items-center text-sm text-neutral-500">No data in this range.</div> : <div className="h-56">{children}</div>}
    </section>
  );
}

const axis = { tick: { fontSize: 11, fill: PALETTE.muted }, axisLine: { stroke: PALETTE.line }, tickLine: false as const };
const tip = { contentStyle: { fontSize: 12, borderRadius: 6, borderColor: PALETTE.line } };

export function Charts({ s }: { s: Series }) {
  const sum = (a: number[]) => a.reduce((n, x) => n + x, 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Emails sent per week" rows={s.emailsPerWeek} slug="emails-per-week" empty={!sum(s.emailsPerWeek.map((x) => x.sent))}>
        <ResponsiveContainer><BarChart data={s.emailsPerWeek} margin={{ left: -10, right: 8, top: 8 }}><CartesianGrid vertical={false} stroke={PALETTE.line} /><XAxis dataKey="week" tickFormatter={shortWeek} {...axis} /><YAxis {...axis} allowDecimals={false} /><Tooltip {...tip} labelFormatter={(l) => `Week of ${shortWeek(String(l))}`} cursor={{ fill: "#00000008" }} /><Bar dataKey="sent" name="Emails sent" fill={PALETTE.accent} radius={[4, 4, 0, 0]} maxBarSize={28} /></BarChart></ResponsiveContainer>
      </Card>
      <Card title="Open rate per distribution" sub="Last 20 distributions, oldest to newest" rows={s.openRate} slug="open-rate" empty={!s.openRate.length}>
        <ResponsiveContainer><LineChart data={s.openRate} margin={{ left: -10, right: 8, top: 8 }}><CartesianGrid vertical={false} stroke={PALETTE.line} /><XAxis dataKey="label" {...axis} interval="preserveStartEnd" /><YAxis {...axis} unit="%" domain={[0, 100]} /><Tooltip {...tip} formatter={(v: any, _n: any, p: any) => [`${v}% (${p.payload.opened} of ${p.payload.sent})`, "Open rate"]} /><Line type="monotone" dataKey="rate" name="Open rate" stroke={PALETTE.accent} strokeWidth={2} dot={{ r: 4, fill: PALETTE.accent, strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} /></LineChart></ResponsiveContainer>
      </Card>
      <Card title="Coverage per week by type" rows={s.coverageByType} slug="coverage-by-type" empty={!s.coverageByType.some((r) => s.types.some((t) => Number(r[t]) > 0))}>
        <ResponsiveContainer><BarChart data={s.coverageByType} margin={{ left: -10, right: 8, top: 8 }}><CartesianGrid vertical={false} stroke={PALETTE.line} /><XAxis dataKey="week" tickFormatter={shortWeek} {...axis} /><YAxis {...axis} allowDecimals={false} /><Tooltip {...tip} labelFormatter={(l) => `Week of ${shortWeek(String(l))}`} cursor={{ fill: "#00000008" }} /><Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => title(String(v))} />{s.types.map((t) => <Bar key={t} dataKey={t} stackId="a" fill={TYPE_COLORS[t] ?? PALETTE.muted} stroke="#fff" strokeWidth={1} maxBarSize={28} />)}</BarChart></ResponsiveContainer>
      </Card>
      <Card title="Sentiment split" rows={s.sentiment} slug="sentiment" empty={!sum(s.sentiment.map((x) => x.value))}>
        <ResponsiveContainer><PieChart><Pie data={s.sentiment} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2} stroke="#fff" label={(p: any) => `${title(p.name)} ${p.value}`} labelLine={false} fontSize={11}>{s.sentiment.map((x) => <Cell key={x.name} fill={SENTIMENT_COLORS[x.name] ?? PALETTE.muted} />)}</Pie><Tooltip {...tip} formatter={(v: any, n: any) => [v, title(String(n))]} /></PieChart></ResponsiveContainer>
      </Card>
      <Card title="Reach over time" sub="Cumulative estimated reach of logged coverage" rows={s.reach} slug="reach" empty={!sum(s.reach.map((x) => x.reach))}>
        <ResponsiveContainer><AreaChart data={s.reach} margin={{ left: 4, right: 8, top: 8 }}><defs><linearGradient id="reachFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PALETTE.accent} stopOpacity={0.35} /><stop offset="100%" stopColor={PALETTE.accent} stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} stroke={PALETTE.line} /><XAxis dataKey="week" tickFormatter={shortWeek} {...axis} /><YAxis {...axis} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v))} width={48} /><Tooltip {...tip} labelFormatter={(l) => `Week of ${shortWeek(String(l))}`} formatter={(v: any, n: any) => [Number(v).toLocaleString(), n === "cumulative" ? "Cumulative reach" : "Reach this week"]} /><Area type="monotone" dataKey="cumulative" stroke={PALETTE.accent} strokeWidth={2} fill="url(#reachFill)" /></AreaChart></ResponsiveContainer>
      </Card>
      <Card title="Contacts added per week" rows={s.contactsPerWeek} slug="contacts-per-week" empty={!sum(s.contactsPerWeek.map((x) => x.added))}>
        <ResponsiveContainer><BarChart data={s.contactsPerWeek} margin={{ left: -10, right: 8, top: 8 }}><CartesianGrid vertical={false} stroke={PALETTE.line} /><XAxis dataKey="week" tickFormatter={shortWeek} {...axis} /><YAxis {...axis} allowDecimals={false} /><Tooltip {...tip} labelFormatter={(l) => `Week of ${shortWeek(String(l))}`} cursor={{ fill: "#00000008" }} /><Bar dataKey="added" name="Contacts added" fill={PALETTE.good} radius={[4, 4, 0, 0]} maxBarSize={28} /></BarChart></ResponsiveContainer>
      </Card>
      <Card title="Releases published per month" rows={s.releasesPerMonth} slug="releases-per-month" empty={!sum(s.releasesPerMonth.map((x) => x.published))}>
        <ResponsiveContainer><BarChart data={s.releasesPerMonth} margin={{ left: -10, right: 8, top: 8 }}><CartesianGrid vertical={false} stroke={PALETTE.line} /><XAxis dataKey="month" tickFormatter={shortMonth} {...axis} /><YAxis {...axis} allowDecimals={false} /><Tooltip {...tip} labelFormatter={(l) => shortMonth(String(l))} cursor={{ fill: "#00000008" }} /><Bar dataKey="published" name="Releases published" fill={PALETTE.warn} radius={[4, 4, 0, 0]} maxBarSize={28} /></BarChart></ResponsiveContainer>
      </Card>
    </div>
  );
}
