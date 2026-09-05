// Email verification: syntax, MX lookup (cached per run), optional SMTP probe, and a pure classifier.
import dns from "dns/promises";
import net from "net";

export type EmailVerdict = "VALID" | "INVALID" | "RISKY";

// RFC-ish: local part without spaces or a second @, a dotted domain with a 2+ letter TLD.
const SYNTAX = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

export function isEmailSyntaxValid(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim();
  if (e.length > 254 || e.startsWith(".") || e.includes("..")) return false;
  const [local] = e.split("@");
  if (!local || local.length > 64 || local.endsWith(".")) return false;
  return SYNTAX.test(e);
}

export function domainOf(email: string) {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

/**
 * Pure verdict.
 *  - smtpCode undefined: SMTP probe was not attempted (VERIFY_SMTP off) -> syntax + MX decide.
 *  - smtpCode null: probe attempted but inconclusive (timeout, 4xx greylist) -> RISKY.
 *  - 250 -> VALID; 550/551/553 -> INVALID; anything else -> RISKY.
 */
export function classifyEmail({ syntaxOk, mxOk, smtpCode }: { syntaxOk: boolean; mxOk: boolean; smtpCode?: number | null }): EmailVerdict {
  if (!syntaxOk) return "INVALID";
  if (!mxOk) return "INVALID";
  if (smtpCode === undefined) return "VALID";
  if (smtpCode === 250) return "VALID";
  if (smtpCode === 550 || smtpCode === 551 || smtpCode === 553) return "INVALID";
  return "RISKY";
}

/** Statuses that are set by real delivery signals and must never be overwritten by verification. */
export const PROTECTED_STATUSES = ["BOUNCED", "COMPLAINED", "UNSUBSCRIBED"] as const;
export function canVerify(status: string) {
  return !(PROTECTED_STATUSES as readonly string[]).includes(status);
}

export type MxResult = { ok: boolean; hosts: string[] };
export type MxCache = Map<string, Promise<MxResult>>;

/** MX lookup with A-record fallback. Pass one cache per run so a domain is resolved once. */
export function lookupMx(domain: string, cache: MxCache = new Map()): Promise<MxResult> {
  const d = domain.toLowerCase();
  const hit = cache.get(d);
  if (hit) return hit;
  const p = (async () => {
    try {
      const mx = await dns.resolveMx(d);
      const hosts = mx.filter((m) => m.exchange && m.exchange !== ".").sort((a, b) => a.priority - b.priority).map((m) => m.exchange);
      if (hosts.length) return { ok: true, hosts };
    } catch { /* fall through to A */ }
    try {
      const a = await dns.resolve4(d);
      if (a.length) return { ok: true, hosts: [d] };
    } catch { /* no A either */ }
    return { ok: false, hosts: [] };
  })();
  cache.set(d, p);
  return p;
}

/** Parse the first 3-digit code from an SMTP line. */
export function smtpCodeOf(line: string): number | null {
  const m = line.match(/^(\d{3})/);
  return m ? Number(m[1]) : null;
}

/**
 * Minimal SMTP RCPT probe. Resolves to the RCPT TO response code, or null when the conversation
 * could not complete (connection refused, timeout, non-2xx banner/EHLO/MAIL FROM).
 */
export function smtpProbe(mxHost: string, email: string, fromDomain: string, timeoutMs = 5000): Promise<number | null> {
  return new Promise((resolve) => {
    let done = false;
    let buf = "";
    let step = 0;
    const steps = [`EHLO ${fromDomain}\r\n`, `MAIL FROM:<verify@${fromDomain}>\r\n`, `RCPT TO:<${email}>\r\n`, "QUIT\r\n"];
    const sock = net.connect({ host: mxHost, port: 25 });
    const finish = (code: number | null) => { if (done) return; done = true; clearTimeout(timer); sock.destroy(); resolve(code); };
    const timer = setTimeout(() => finish(null), timeoutMs);
    sock.on("error", () => finish(null));
    sock.on("close", () => finish(null));
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      // Wait for a complete final line: "250 " (space after code) rather than "250-" continuation.
      const lines = buf.split(/\r?\n/);
      const last = lines.filter((l) => /^\d{3} /.test(l)).pop();
      if (!last) return;
      buf = "";
      const code = smtpCodeOf(last);
      if (step === 0 || step === 1 || step === 2) {
        if (code === null || code >= 400) return finish(null);
        sock.write(steps[step]);
        step++;
        return;
      }
      if (step === 3) {
        // Response to RCPT TO
        sock.write(steps[3]);
        return finish(code);
      }
    });
  });
}

export type VerifyResult = { verdict: EmailVerdict; syntaxOk: boolean; mxOk: boolean; smtpCode?: number | null };

/** Full check for one address. SMTP runs only when `smtp` is true. */
export async function verifyEmail(email: string, opts: { cache?: MxCache; smtp?: boolean; fromDomain?: string } = {}): Promise<VerifyResult> {
  const syntaxOk = isEmailSyntaxValid(email);
  if (!syntaxOk) return { verdict: "INVALID", syntaxOk, mxOk: false };
  const mx = await lookupMx(domainOf(email), opts.cache);
  if (!mx.ok) return { verdict: "INVALID", syntaxOk, mxOk: false };
  if (!opts.smtp) return { verdict: classifyEmail({ syntaxOk, mxOk: true }), syntaxOk, mxOk: true };
  const smtpCode = await smtpProbe(mx.hosts[0], email, opts.fromDomain ?? "localhost");
  return { verdict: classifyEmail({ syntaxOk, mxOk: true, smtpCode }), syntaxOk, mxOk: true, smtpCode };
}

export function appHostname() {
  try { return new URL(process.env.APP_URL ?? "http://localhost:3000").hostname; } catch { return "localhost"; }
}
