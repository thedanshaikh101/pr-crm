import { LoginForm } from "@/components/settings/auth/LoginForm";

// Server wrapper so the Google button only renders when GOOGLE_CLIENT_ID is set (env is not visible to client code).
export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return <LoginForm googleEnabled={!!process.env.GOOGLE_CLIENT_ID} error={searchParams.error} />;
}
