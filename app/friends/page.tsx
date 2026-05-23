import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import SubmitButton from "@/components/SubmitButton";
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
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-emerald-700">BayarLah</p>
            <h1 className="text-3xl font-bold">Friends</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm font-medium text-zinc-600 hover:text-zinc-950">
              Dashboard
            </Link>
            <Link href="/expenses" className="text-sm font-medium text-zinc-600 hover:text-zinc-950">
              Expenses
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        {params.error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {params.error}
          </div>
        ) : null}

        {params.success ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {params.success}
          </div>
        ) : null}

        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Add friend</h2>
          <form action={createFriend} className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Name</span>
              <input
                name="name"
                required
                className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-emerald-600"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">WhatsApp phone</span>
              <input
                name="phone"
                required
                placeholder="0123456789"
                className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-emerald-600"
              />
            </label>

            <div className="flex items-end">
              <SubmitButton pendingLabel="Adding..." className="w-full md:w-auto">
                Add
              </SubmitButton>
            </div>
          </form>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Saved friends</h2>
            <span className="text-sm text-zinc-500">{friends.length} total</span>
          </div>

          {friends.length > 0 ? (
            <div className="mt-4 divide-y divide-zinc-100">
              {friends.map((friend) => (
                <div key={friend.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="font-medium">{friend.name}</p>
                    <p className="text-sm text-zinc-500">{friend.phone}</p>
                  </div>
                  <form action={deleteFriend}>
                    <input type="hidden" name="friendId" value={friend.id} />
                    <SubmitButton
                      variant="danger"
                      pendingLabel="Removing..."
                      className="px-3 py-2 text-sm"
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
