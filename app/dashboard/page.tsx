export const dynamic = "force-dynamic";

import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { ensureUserInDB } from "@/lib/actions/user";
import { isProfileComplete } from "@/lib/profile";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const dbUser = await ensureUserInDB();
  if (!isProfileComplete(dbUser)) redirect("/profile?next=/dashboard");

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">BayarLah</p>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Logged in as {user.emailAddresses[0]?.emailAddress}
            </p>
          </div>
          <UserButton afterSignOutUrl="/" />
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <Link
            href="/friends"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm hover:border-emerald-300"
          >
            <h2 className="font-semibold">Friends</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Add WhatsApp contacts who can receive reminders later.
            </p>
          </Link>

          <Link
            href="/expenses"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm hover:border-emerald-300"
          >
            <h2 className="font-semibold">Expenses</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Record who owes what after you pay first.
            </p>
          </Link>

          <Link
            href="/profile"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm hover:border-emerald-300"
          >
            <h2 className="font-semibold">Profile</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Edit your DuitNow details and QR image.
            </p>
          </Link>
        </section>
      </div>
    </main>
  );
}
