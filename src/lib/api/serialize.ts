// Output shapes for /api/v1. Keep in sync with components in openapi.ts.

export function contactOut(c: any) {
  return {
    id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email ?? null, emailStatus: c.emailStatus,
    jobTitle: c.jobTitle ?? null, outlet: c.organization?.name ?? null, mobile: c.mobile ?? null, landline: c.landline ?? null,
    tags: Array.isArray(c.tags) ? c.tags.map((t: any) => t.tag?.name ?? t.name).filter(Boolean) : [],
    createdAt: c.createdAt, updatedAt: c.updatedAt,
  };
}

export function listOut(l: any) {
  return { id: l.id, name: l.name, description: l.description ?? null, isSmart: !!l.isSmart, memberCount: l._count?.members ?? 0, createdAt: l.createdAt, updatedAt: l.updatedAt };
}

export type ReleaseStats = { sent: number; delivered: number; opened: number };

export function releaseOut(r: any, accountSlug: string, stats: ReleaseStats) {
  return {
    id: r.id, headline: r.headline, slug: r.slug, status: r.status, kind: r.kind, publishedAt: r.publishedAt ?? null, scheduledFor: r.scheduledFor ?? null,
    shortCode: r.shortCode, shortLink: `/r/${r.shortCode}`, newsroomPath: `/n/${accountSlug}/${r.slug}`,
    client: r.client ? { id: r.client.id, name: r.client.name } : null,
    stats, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function coverageOut(x: any) {
  return {
    id: x.id, outletName: x.outletName, headline: x.headline, url: x.url ?? null, publishedAt: x.publishedAt, type: x.type, focus: x.focus, sentiment: x.sentiment,
    clientId: x.clientId ?? null, releaseId: x.releaseId ?? null, estimatedReach: x.estimatedReach ?? null, adValue: x.adValue == null ? null : Number(x.adValue),
    pickupCount: x.pickupCount ?? 0, createdAt: x.createdAt, updatedAt: x.updatedAt,
  };
}
