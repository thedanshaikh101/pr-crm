import { createHash } from "crypto";
import { db } from "@/lib/db";

export async function accountFromApiKey(req: Request) {
  const raw = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("x-api-key");
  if (!raw) return null;
  const keyHash = createHash("sha256").update(raw).digest("hex");
  const key = await db.apiKey.findUnique({ where: { keyHash }, include: { account: true } });
  if (!key || key.revokedAt || key.account.suspendedAt) return null;
  await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return key.account;
}
