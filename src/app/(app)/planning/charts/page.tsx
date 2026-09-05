import { requireViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { bucketByMonth, bucketByWeek, dayKey, rangeFor, rate, stackBy, sumBy } from "@/lib/planning/agg";
import { COVERAGE_TYPES } from "@/lib/coverage/filters";
import { Charts, type Series } from "@/components/planning/Charts";
import { RangeControls } from "@/components/planning/RangeControls";

export default async function ChartsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const v = await requireViewer();
  const sp = (k: string) => { const x = searchParams[k]; return Array.isArray(x) ? x[0] : x; };
  const range = rangeFor(sp("preset"), sp("from"), sp("to"));
  const clientId = sp("client") || "";
  const a = v.account.id;
  const inRange = { gte: range.from, lte: range.to };
  const clientRel = clientId ? { release: { clientId } } : {};

  const [clients, recipients, distributions, coverage, contacts, releases] = await Promise.all([
    db.client.findMany({ where: { accountId: a }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.distributionRecipient.findMany({ where: { distribution: { accountId: a, isTest: false, ...(clientId ? { release: { clientId } } : {}) }, OR: [{ deliveredAt: inRange }, { deliveredAt: null, distribution: { createdAt: inRange } }] }, select: { deliveredAt: true, distribution: { select: { createdAt: true } } }, take: 100_000 }),
    db.distribution.findMany({ where: { accountId: a, isTest: false, status: "SENT", ...clientRel }, orderBy: { createdAt: "desc" }, take: 20, include: { release: { select: { headline: true } }, recipients: { select: { firstOpenAt: true, deliveredAt: true } } } }),
    db.coverage.findMany({ where: { accountId: a, deletedAt: null, parentId: null, publishedAt: inRange, ...(clientId ? { clientId } : {}) }, select: { publishedAt: true, type: true, sentiment: true, estimatedReach: true } }),
    db.contact.findMany({ where: { accountId: a, deletedAt: null, createdAt: inRange }, select: { createdAt: true } }),
    db.release.findMany({ where: { accountId: a, deletedAt: null, publishedAt: inRange, ...(clientId ? { clientId } : {}) }, select: { publishedAt: true } }),
  ]);

  const emailWeeks = bucketByWeek(recipients, (r: any) => r.deliveredAt ?? r.distribution.createdAt, range.from, range.to);
  const covWeeks = bucketByWeek(coverage, "publishedAt", range.from, range.to);
  let cumulative = 0;
  const types = [...COVERAGE_TYPES];
  const series: Series = {
    emailsPerWeek: emailWeeks.map((b) => ({ week: b.key, sent: b.count })),
    openRate: [...distributions].reverse().map((d: any) => {
      const sent = d.recipients.filter((r: any) => r.deliveredAt).length || d.recipientCount;
      const opened = d.recipients.filter((r: any) => r.firstOpenAt).length;
      return { label: d.createdAt.toLocaleDateString("en-CA", { month: "short", day: "numeric" }), rate: rate(opened, sent), sent, opened, release: d.release.headline };
    }),
    coverageByType: covWeeks.map((b) => ({ week: b.key, ...Object.fromEntries(types.map((t) => [t, 0])), ...stackBy(b.items, "type") })),
    types,
    sentiment: ["POSITIVE", "NEUTRAL", "NEGATIVE"].map((name) => ({ name, value: coverage.filter((c: any) => c.sentiment === name).length })),
    reach: covWeeks.map((b) => { const r = sumBy(b.items, "estimatedReach"); cumulative += r; return { week: b.key, reach: r, cumulative }; }),
    contactsPerWeek: bucketByWeek(contacts, "createdAt", range.from, range.to).map((b) => ({ week: b.key, added: b.count })),
    releasesPerMonth: bucketByMonth(releases, "publishedAt", range.from, range.to).map((b) => ({ month: b.key, published: b.count })),
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h1 className="text-xl font-semibold">Charts</h1><p className="text-xs text-neutral-500">{range.from.toLocaleDateString()} to {range.to.toLocaleDateString()}</p></div>
      <RangeControls base="/planning/charts" from={dayKey(range.from)} to={dayKey(range.to)} preset={range.preset} clientId={clientId} clients={clients} />
      <Charts s={series} />
    </div>
  );
}
