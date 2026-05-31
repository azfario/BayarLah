import { SignUp } from "@clerk/nextjs";
import AuthPageShell, {
  bayarlahAuthAppearance,
} from "@/components/AuthPageShell";

export default function SignUpPage() {
  return (
    <AuthPageShell
      mode="sign-up"
      eyebrow="Create your account"
      title="Start collecting cleanly."
      description="Create your BayarLah account and move straight into your dashboard."
    >
      <SignUp
        appearance={bayarlahAuthAppearance}
        fallbackRedirectUrl="/dashboard"
        signInUrl="/sign-in"
      />
    </AuthPageShell>
  );
}
