// Pure provider-event normalizers (no DB) so they unit-test cleanly.
export type ProviderEvent = { type: "delivered" | "opened" | "clicked" | "bounced" | "complained" | "unsubscribed" | "dropped" | "blocked"; providerMsgId: string; url?: string; bounceType?: "hard" | "soft"; at?: Date };

/** Normalize a provider webhook payload (Resend shape by default) into ProviderEvent. Pure; unit-tested. */
export function normalizeResendEvent(body: any): ProviderEvent | null {
  const id = body?.data?.email_id;
  if (!id) return null;
  const at = body.created_at ? new Date(body.created_at) : new Date();
  switch (body.type) {
    case "email.delivered": return { type: "delivered", providerMsgId: id, at };
    case "email.opened": return { type: "opened", providerMsgId: id, at };
    case "email.clicked": return { type: "clicked", providerMsgId: id, url: body.data?.click?.link, at };
    case "email.bounced": return { type: "bounced", providerMsgId: id, bounceType: /hard|permanent/i.test(body.data?.bounce?.type ?? "") ? "hard" : "soft", at };
    case "email.complained": return { type: "complained", providerMsgId: id, at };
    case "email.delivery_delayed": return null;
    default: return null;
  }
}

