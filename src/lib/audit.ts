import { db } from "./db";

export async function audit(
  accountId: string,
  userId: string | null,
  action: string,
  entity?: string,
  entityId?: string,
  meta?: Record<string, unknown>,
) {
  await db.auditLog.create({ data: { accountId, userId, action, entity, entityId, meta: meta as any } });
}
