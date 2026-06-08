import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import ExpenseCreateTabs from "@/app/expenses/ExpenseCreateTabs";
import StatusToast from "@/components/StatusToast";
import Header from "@/components/Header";
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
    <main className="min-h-screen bg-white px-4 py-5 text-[#0a0a0a] sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <Header title="Create expense" />

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
