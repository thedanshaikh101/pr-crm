// API key and webhook secret generation. Keys are shown once; only the sha256 hash is stored.
import { createHash, randomBytes } from "crypto";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function randomBase62(len: number) {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % 62];
  return out;
}

export const API_KEY_PREFIX = "pd_live_";
export const PREFIX_LENGTH = 12;

export function generateApiKey() {
  return `${API_KEY_PREFIX}${randomBase62(32)}`;
}

/** Same hash as src/lib/api/auth.ts uses to look keys up. */
export function hashApiKey(plaintext: string) {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function apiKeyPrefix(plaintext: string) {
  return plaintext.slice(0, PREFIX_LENGTH);
}

export function isValidApiKey(plaintext: string) {
  return /^pd_live_[0-9A-Za-z]{32}$/.test(plaintext);
}

export function generateWebhookSecret() {
  return `whsec_${randomBase62(32)}`;
}
