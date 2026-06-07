import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { saveProfile } from "@/lib/actions/profile";
import { ensureUserInDB } from "@/lib/actions/user";
import { isProfileComplete } from "@/lib/profile";
import StatusToast from "@/components/StatusToast";
import SubmitButton from "@/components/SubmitButton";
import BrandLogo from "@/components/BrandLogo";
import DuitNowIdFields from "./DuitNowIdFields";

export const dynamic = "force-dynamic";

type ProfilePageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
    success?: string;
  }>;
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

  const user = await ensureUserInDB();
  const params = await searchParams;
  const next = getSafeNext(params.next);
  const completed = isProfileComplete(user);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-950 sm:py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <BrandLogo href="/dashboard" className="text-sm" />
            <h1 className="break-words text-2xl font-bold sm:text-3xl">
              {completed ? "Edit profile" : "Complete your profile"}
            </h1>
          </div>
          <UserButton />
        </header>

        <StatusToast error={params.error} success={params.success} />

        <form
          action={saveProfile}
          className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6"
        >
          <input type="hidden" name="redirectTo" value={next} />

          <div className="grid gap-5 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Display name</span>
              <input
                name="fullName"
                defaultValue={user.fullName ?? ""}
                required
                placeholder="Nur Aisyah Ahmad"
                className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Phone number</span>
              <input
                name="phone"
                defaultValue={user.phone ?? ""}
                required
                placeholder="+60123456789"
                inputMode="tel"
                className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
              />
              <span className="text-sm text-zinc-500">
                Used for WhatsApp payment notifications.
              </span>
            </label>

            <DuitNowIdFields
              defaultType={user.duitNowIdType}
              defaultValue={user.duitNowIdValue}
            />

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">DuitNow recipient name</span>
              <input
                name="duitNowRecipientName"
                defaultValue={user.duitNowRecipientName ?? ""}
                required
                placeholder="Name shown on bank receipts"
                className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
              />
              <span className="text-sm text-zinc-500">
                Exact name shown by your bank after someone scans your DuitNow
                QR. Used to verify payment receipts.
              </span>
            </label>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">DuitNow QR image</span>
                <input
                  name="duitNowQr"
                  type="file"
                  accept="image/*"
                  required={!user.duitNowQrUrl}
                  className="h-10 rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-sm"
                />
              </label>
              <p className="text-sm text-zinc-500">
                Required for reminders. Upload a new image to replace the saved QR.
              </p>
            </div>

            <div>
              {user.duitNowQrUrl ? (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Current QR</span>
                  {/* User-upload hosts vary by environment, so render the stored URL directly. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={user.duitNowQrUrl}
                    alt="Current DuitNow QR"
                    className="aspect-square rounded-md border border-zinc-200 object-cover"
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex justify-stretch sm:justify-end">
            <SubmitButton
              pendingLabel="Saving profile..."
              className="w-full sm:w-auto"
            >
              {completed ? "Save profile" : "Save profile details"}
            </SubmitButton>
          </div>
        </form>
      </div>
    </main>
  );
}

function getSafeNext(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}
