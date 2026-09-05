import { RegisterForm } from "@/components/settings/auth/RegisterForm";

// Server wrapper so the Google button only renders when GOOGLE_CLIENT_ID is set; passes ?invite= through.
export default function RegisterPage({ searchParams }: { searchParams: { invite?: string } }) {
  return <RegisterForm googleEnabled={!!process.env.GOOGLE_CLIENT_ID} invite={searchParams.invite} />;
}
