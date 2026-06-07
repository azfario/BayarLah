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
    <main className="min-h-screen bg-[#f7f8fa] px-4 py-5 text-[#0a0a0a] sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <BrandLogo href="/dashboard" className="text-sm" />
          <div className="flex h-11 w-11 items-center justify-center">
            <UserButton />
          </div>
        </header>

        <section className="max-w-2xl">
          <span className="inline-flex rounded-full bg-[#e8ffea] px-3 py-1 text-xs font-semibold text-[#1ba673]">
            {completed ? "Profile settings" : "One-time setup"}
          </span>
          <div className="min-w-0">
            <h1 className="mt-3 break-words text-[32px] font-semibold leading-[1.15] tracking-[-0.5px] sm:text-4xl">
              {completed ? "Edit profile" : "Complete your profile"}
            </h1>
            <p className="mt-3 text-base leading-6 text-[#5f5f5f]">
              Add your contact and DuitNow details so friends know where to pay
              and payment receipts can be verified.
            </p>
          </div>
        </section>

        <StatusToast error={params.error} success={params.success} />

        <form
          action={saveProfile}
          className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white"
        >
          <input type="hidden" name="redirectTo" value={next} />

          <section className="p-5 sm:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8e8e93]">
                Personal details
              </p>
              <h2 className="mt-1 text-xl font-semibold">How friends know you</h2>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">Display name</span>
                <input
                  name="fullName"
                  defaultValue={user.fullName ?? ""}
                  required
                  placeholder="Nur Aisyah Ahmad"
                  autoComplete="name"
                  className="h-11 rounded-lg border border-[#e5e7eb] bg-white px-4 text-base outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
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
                  autoComplete="tel"
                  className="h-11 rounded-lg border border-[#e5e7eb] bg-white px-4 text-base outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
                />
                <span className="text-sm leading-5 text-[#5f5f5f]">
                  Used for WhatsApp payment notifications.
                </span>
              </label>
            </div>
          </section>

          <section className="border-t border-[#eaecf0] p-5 sm:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8e8e93]">
                DuitNow details
              </p>
              <h2 className="mt-1 text-xl font-semibold">Where payments go</h2>
              <p className="mt-2 text-sm leading-5 text-[#5f5f5f]">
                These details appear in reminders sent to friends.
              </p>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <DuitNowIdFields
                defaultType={user.duitNowIdType}
                defaultValue={user.duitNowIdValue}
              />

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">
                  DuitNow recipient name
                </span>
                <input
                  name="duitNowRecipientName"
                  defaultValue={user.duitNowRecipientName ?? ""}
                  required
                  placeholder="Name shown on bank receipts"
                  className="h-11 rounded-lg border border-[#e5e7eb] bg-white px-4 text-base outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
                />
                <span className="text-sm leading-5 text-[#5f5f5f]">
                  Enter the exact name your bank shows after the QR is scanned.
                  We use it to verify payment receipts.
                </span>
              </label>
            </div>
          </section>

          <section className="border-t border-[#eaecf0] p-5 sm:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8e8e93]">
                Payment QR
              </p>
              <h2 className="mt-1 text-xl font-semibold">
                Make paying effortless
              </h2>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium">DuitNow QR image</span>
                  <input
                    name="duitNowQr"
                    type="file"
                    accept="image/*"
                    required={!user.duitNowQrUrl}
                    className="block min-h-11 cursor-pointer rounded-lg border border-[#e5e7eb] bg-white text-sm text-[#5f5f5f] file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-full file:border-0 file:bg-[#0a0a0a] file:px-5 file:text-sm file:font-semibold file:text-white"
                  />
                </label>
                <p className="mt-2 text-sm leading-5 text-[#5f5f5f]">
                  Upload a clear image of your QR. A new image will replace the
                  one currently saved.
                </p>
              </div>

              {user.duitNowQrUrl ? (
                <div className="flex items-center gap-4 rounded-xl bg-[#f7f8fa] p-3 sm:w-36 sm:flex-col sm:items-start">
                  {/* User-upload hosts vary by environment, so render the stored URL directly. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={user.duitNowQrUrl}
                    alt="Current DuitNow QR"
                    className="h-20 w-20 shrink-0 rounded-lg border border-[#e5e7eb] bg-white object-cover sm:h-28 sm:w-28"
                  />
                  <div>
                    <p className="text-sm font-semibold">Current QR</p>
                    <p className="mt-1 text-xs leading-4 text-[#5f5f5f]">
                      Saved and ready to use
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <div className="flex justify-stretch border-t border-[#eaecf0] bg-[#f7f8fa] p-4 sm:justify-end sm:px-6">
            <SubmitButton
              pendingLabel="Saving profile..."
              className="min-h-11 w-full sm:w-auto"
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
