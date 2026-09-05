"use server";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/auth";

export async function saveColumnLayout(screen: string, columns: { key: string; label: string; visible: boolean }[]) {
  const v = await requireViewer();
  await db.columnLayout.upsert({ where: { userId_screen: { userId: v.user.id, screen } }, create: { userId: v.user.id, screen, columns: columns as any }, update: { columns: columns as any } });
}

export async function saveView(screen: string, name: string, params: string, shared = false) {
  const v = await requireViewer();
  await db.savedView.create({ data: { accountId: v.account.id, userId: v.user.id, screen, name, params, shared } });
}
