/** "Continue with Google" link plus divider. Only rendered when GOOGLE_CLIENT_ID is set (the page decides). */
export function GoogleButton({ invite, label = "Continue with Google" }: { invite?: string; label?: string }) {
  const href = invite ? `/api/auth/google?invite=${encodeURIComponent(invite)}` : "/api/auth/google";
  return (
    <div className="mt-4">
      <div className="relative my-3 text-center text-xs text-neutral-500"><span className="relative z-10 bg-white px-2">or</span><span className="absolute inset-x-0 top-1/2 -z-0 border-t border-line" aria-hidden="true" /></div>
      <a href={href} className="btn w-full justify-center">
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.5 5.8c4.4-4 7-10 7-17.5z"/><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z"/></svg>
        {label}
      </a>
    </div>
  );
}
