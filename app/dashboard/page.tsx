export const dynamic = "force-dynamic";

import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { ensureUserInDB } from "@/lib/actions/user";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  await ensureUserInDB();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <UserButton afterSignOutUrl="/" />
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-gray-600">
        Logged in as: {user.emailAddresses[0]?.emailAddress}
      </p>
    </div>
  );
}
