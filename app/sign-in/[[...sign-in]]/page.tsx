import { SignIn } from "@clerk/nextjs";
import AuthPageShell, {
  bayarlahAuthAppearance,
} from "@/components/AuthPageShell";

export default function SignInPage() {
  return (
    <AuthPageShell
      mode="sign-in"
      eyebrow="Welcome back"
      title="Pick up where you left off."
      description="Sign in to review unpaid shares, reminders, and recent expenses."
    >
      <SignIn
        appearance={bayarlahAuthAppearance}
        fallbackRedirectUrl="/dashboard"
        signUpUrl="/sign-up"
      />
    </AuthPageShell>
  );
}
