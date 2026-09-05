// Google OAuth helpers shared by the two route handlers.
export function appBase() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function googleRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || `${appBase()}/api/auth/google/callback`;
}

export function googleEnabled() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}
