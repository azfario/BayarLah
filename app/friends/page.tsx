import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import StatusToast from "@/components/StatusToast";
import SubmitButton from "@/components/SubmitButton";
import BrandLogo from "@/components/BrandLogo";
import { createFriend, deleteFriend } from "@/lib/actions/friends";
import { ensureUserInDB } from "@/lib/actions/user";
import { prisma } from "@/lib/db";
import { isProfileComplete } from "@/lib/profile";

export const dynamic = "force-dynamic";

type FriendsPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function FriendsPage({ searchParams }: FriendsPageProps) {
  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

  const user = await ensureUserInDB();
  if (!isProfileComplete(user)) redirect("/profile?next=/friends");

  const [params, friends] = await Promise.all([
    searchParams,
    prisma.friend.findMany({
      where: { ownerId: user.id },
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-950 sm:py-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <BrandLogo href="/dashboard" className="text-sm" />
            <h1 className="text-3xl font-bold">Friends</h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href="/dashboard" className="text-sm font-medium text-zinc-600 hover:text-zinc-950">
              Dashboard
            </Link>
            <Link href="/expenses" className="text-sm font-medium text-zinc-600 hover:text-zinc-950">
              Expenses
            </Link>
            <UserButton />
          </div>
        </header>

        <StatusToast error={params.error} success={params.success} />

        <section className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-xl font-semibold">Add friend</h2>
          <form action={createFriend} className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Name</span>
              <input
                name="name"
                required
                placeholder="Nur Aisyah"
                className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">WhatsApp phone</span>
              <input
                name="phone"
                required
                placeholder="0123456789"
                className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
              />
            </label>

            <div className="flex items-end">
              <SubmitButton pendingLabel="Adding..." className="w-full md:w-auto">
                Add
              </SubmitButton>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Saved friends</h2>
            <span className="text-sm text-zinc-500">{friends.length} total</span>
          </div>

          {friends.length > 0 ? (
            <div className="mt-4 divide-y divide-zinc-100">
              {friends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{friend.name}</p>
                    <p className="break-all text-sm text-zinc-500">{friend.phone}</p>
                  </div>
                  <form action={deleteFriend} className="w-full sm:w-auto">
                    <input type="hidden" name="friendId" value={friend.id} />
                    <SubmitButton
                      variant="danger"
                      pendingLabel="Removing..."
                      className="w-full px-3 py-2 text-sm sm:w-auto"
                    >
                      Remove
                    </SubmitButton>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              Add friends here first, then select them when creating expenses.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
