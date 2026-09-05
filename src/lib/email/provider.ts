// Transactional provider abstraction. Add SendGrid/Postmark by implementing EmailProvider.
export type OutboundEmail = {
  to: string;
  from: string; // "Name <addr@domain>"
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: Record<string, string>;
};

export type EmailProvider = {
  name: string;
  send(msg: OutboundEmail): Promise<{ providerMsgId: string }>;
  createDomain(domain: string): Promise<{ providerId: string; records: { type: string; name: string; value: string }[] }>;
  verifyDomain(providerId: string): Promise<boolean>;
};

const consoleProvider: EmailProvider = {
  name: "console",
  async send(msg) {
    console.log(`[email:console] to=${msg.to} subject=${JSON.stringify(msg.subject)}`);
    return { providerMsgId: `console_${Date.now()}_${Math.random().toString(36).slice(2)}` };
  },
  async createDomain(domain) {
    return {
      providerId: `console_${domain}`,
      records: [
        { type: "TXT", name: `_dmarc.${domain}`, value: "v=DMARC1; p=none;" },
        { type: "TXT", name: domain, value: "v=spf1 include:example.net ~all" },
        { type: "CNAME", name: `resend._domainkey.${domain}`, value: "dkim.example.net" },
        { type: "MX", name: `bounce.${domain}`, value: "feedback-smtp.example.net" },
      ],
    };
  },
  async verifyDomain() { return true; },
};

function resendProvider(): EmailProvider {
  // Lazy import so the console provider works without the SDK configured.
  return {
    name: "resend",
    async send(msg) {
      const { Resend } = await import("resend");
      const r = new Resend(process.env.RESEND_API_KEY);
      const res = await r.emails.send({
        from: msg.from, to: msg.to, replyTo: msg.replyTo, subject: msg.subject,
        html: msg.html, text: msg.text, headers: msg.headers,
        tags: Object.entries(msg.tags ?? {}).map(([name, value]) => ({ name, value })),
      } as any);
      if (res.error) throw new Error(res.error.message);
      return { providerMsgId: res.data!.id };
    },
    async createDomain(domain) {
      const { Resend } = await import("resend");
      const r = new Resend(process.env.RESEND_API_KEY);
      const res = await r.domains.create({ name: domain });
      if (res.error) throw new Error(res.error.message);
      return { providerId: res.data!.id, records: (res.data!.records as any[]).map((x) => ({ type: x.type, name: x.name, value: x.value })) };
    },
    async verifyDomain(providerId) {
      const { Resend } = await import("resend");
      const r = new Resend(process.env.RESEND_API_KEY);
      await r.domains.verify(providerId);
      const d = await r.domains.get(providerId);
      return d.data?.status === "verified";
    },
  };
}

export function emailProvider(): EmailProvider {
  return process.env.EMAIL_PROVIDER === "resend" ? resendProvider() : consoleProvider;
}

/** Merge fields with fallbacks: {{first_name|there}} */
export function mergeFields(template: string, vars: Record<string, string | null | undefined>) {
  return template.replace(/\{\{\s*([a-z_]+)\s*(?:\|\s*([^}]*))?\}\}/gi, (_, key, fallback) => {
    const v = vars[key];
    return v && v.trim() ? v : (fallback ?? "").trim();
  });
}

export function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
