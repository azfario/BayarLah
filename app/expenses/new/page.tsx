import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import ExpenseCreateTabs from "@/app/expenses/ExpenseCreateTabs";
import StatusToast from "@/components/StatusToast";
import BrandLogo from "@/components/BrandLogo";
import { ensureUserInDB } from "@/lib/actions/user";
import { prisma } from "@/lib/db";
import { isProfileComplete } from "@/lib/profile";

export const dynamic = "force-dynamic";

type ExpenseCreatePageProps = {
  searchParams: Promise<{
    error?: string;
    mode?: string;
    success?: string;
  }>;
};

export default async function ExpenseCreatePage({
  searchParams,
}: ExpenseCreatePageProps) {
  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

  const user = await ensureUserInDB();
  const params = await searchParams;
  const initialMode = params.mode === "receipt" ? "receipt" : "manual";
  const nextPath =
    initialMode === "receipt" ? "/expenses/new?mode=receipt" : "/expenses/new";

  if (!isProfileComplete(user)) {
    redirect(`/profile?next=${encodeURIComponent(nextPath)}`);
  }

  const friends = await prisma.friend.findMany({
    where: { ownerId: user.id },
    orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    select: { id: true, name: true, phone: true },
  });

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-950 sm:py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <BrandLogo href="/dashboard" className="text-sm" />
            <h1 className="text-2xl font-bold sm:text-3xl">Record expense</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/expenses"
              className="text-sm font-medium text-zinc-600 hover:text-zinc-950"
            >
              Expenses
            </Link>
            <Link
              href="/friends"
              className="text-sm font-medium text-zinc-600 hover:text-zinc-950"
            >
              Friends
            </Link>
            <UserButton />
          </div>
        </header>

        <StatusToast error={params.error} success={params.success} />

        <ExpenseCreateTabs
          friends={friends}
          collectorName={user.fullName ?? clerkUser.firstName ?? "You"}
          initialMode={initialMode}
        />
      </div>
    </main>
  );
}
