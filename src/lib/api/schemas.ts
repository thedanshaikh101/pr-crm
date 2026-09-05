// zod schemas for /api/v1 request bodies. Shared by the routes and the OpenAPI document tests.
import { z } from "zod";

export const COVERAGE_TYPES = ["BROADCAST", "ONLINE", "PRINT", "RADIO", "PODCAST", "SOCIAL"] as const;
export const COVERAGE_FOCUS = ["NATIONAL", "REGIONAL", "LOCAL", "TRADE", "INTERNATIONAL"] as const;
export const SENTIMENTS = ["POSITIVE", "NEUTRAL", "NEGATIVE"] as const;
export const RELEASE_STATUSES = ["DRAFT", "SCHEDULED", "LIVE", "ARCHIVED"] as const;

const str = (max = 500) => z.string().trim().max(max);
const nullableStr = (max = 500) => z.string().trim().max(max).nullable();

export const ContactCreateBody = z.object({
  firstName: str(120).min(1),
  lastName: str(120).default(""),
  email: z.string().trim().email().optional(),
  jobTitle: str(200).optional(),
  outlet: str(200).optional(),
  mobile: str(60).optional(),
  landline: str(60).optional(),
  tags: z.array(str(80).min(1)).max(50).optional(),
});

export const ContactPatchBody = z.object({
  firstName: str(120).min(1).optional(),
  lastName: str(120).optional(),
  email: z.string().trim().email().nullable().optional(),
  jobTitle: nullableStr(200).optional(),
  outlet: nullableStr(200).optional(),
  mobile: nullableStr(60).optional(),
  landline: nullableStr(60).optional(),
  tags: z.array(str(80).min(1)).max(50).optional(),
}).refine((o) => Object.keys(o).length > 0, { message: "Provide at least one field to change" });

export const ListCreateBody = z.object({ name: str(200).min(1), description: str(2000).optional() });

export const MembersBody = z.object({ contactIds: z.array(z.string().min(1)).min(1).max(1000) });

export const CoverageCreateBody = z.object({
  outletName: str(200).min(1),
  headline: str(500).min(1),
  url: z.string().trim().url().optional(),
  publishedAt: z.coerce.date(),
  type: z.enum(COVERAGE_TYPES),
  focus: z.enum(COVERAGE_FOCUS).optional(),
  sentiment: z.enum(SENTIMENTS).optional(),
  clientId: z.string().optional(),
  releaseId: z.string().optional(),
  estimatedReach: z.number().int().nonnegative().optional(),
  adValue: z.number().nonnegative().optional(),
});

export type ContactCreate = z.infer<typeof ContactCreateBody>;
export type ContactPatch = z.infer<typeof ContactPatchBody>;
export type CoverageCreate = z.infer<typeof CoverageCreateBody>;
