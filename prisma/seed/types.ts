import type { PrismaClient } from "@prisma/client";

/** Shared handles every module seeder receives. Add data, never delete. */
export type SeedCtx = {
  accountId: string;
  ownerId: string;
  editorId: string;
  clientIds: string[];
  contactIds: string[];
  orgIds: string[];
  listIds: string[];
  releaseIds: string[];
  subjectIds: Record<string, string>;
};
export type SeedModule = (db: PrismaClient, ctx: SeedCtx) => Promise<void>;
