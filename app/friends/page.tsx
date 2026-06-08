import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import StatusToast from "@/components/StatusToast";
import SubmitButton from "@/components/SubmitButton";
import Header from "@/components/Header";
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
    <main className="min-h-screen bg-white px-4 py-5 text-[#0a0a0a] sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <Header title="Friends" />

        <StatusToast error={params.error} success={params.success} />

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Add friend</h2>
          <form action={createFriend} className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Name</span>
              <input
                name="name"
                required
                placeholder="Nur Aisyah"
                className="h-11 rounded-full border border-[#e5e7eb] bg-white px-4 text-sm outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">WhatsApp phone</span>
              <input
                name="phone"
                required
                placeholder="0123456789"
                className="h-11 rounded-full border border-[#e5e7eb] bg-white px-4 text-sm outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
              />
            </label>

            <div className="flex items-end">
              <SubmitButton pendingLabel="Adding..." className="w-full md:w-auto">
                Add
              </SubmitButton>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Saved friends</h2>
            <span className="text-sm text-[#5f5f5f]">{friends.length} total</span>
          </div>

          {friends.length > 0 ? (
            <div className="mt-4 divide-y divide-[#eaecf0]">
              {friends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{friend.name}</p>
                    <p className="break-words text-sm text-[#5f5f5f]">{friend.phone}</p>
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
            <p className="mt-4 text-sm text-[#5f5f5f]">
              Add friends here first, then select them when creating expenses.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
