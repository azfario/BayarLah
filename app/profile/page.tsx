import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { saveProfile } from "@/lib/actions/profile";
import { ensureUserInDB } from "@/lib/actions/user";
import { DUITNOW_ID_TYPES } from "@/lib/duitnow";
import { hasProfileDetails, isProfileComplete } from "@/lib/profile";
import StatusToast from "@/components/StatusToast";
import SubmitButton from "@/components/SubmitButton";
import WhatsAppLinkPanel from "@/components/WhatsAppLinkPanel";

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
  const profileReady = hasProfileDetails(user);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">BayarLah</p>
            <h1 className="text-3xl font-bold">
              {completed ? "Edit profile" : "Complete your profile"}
            </h1>
          </div>
          <UserButton afterSignOutUrl="/" />
        </header>

        <StatusToast error={params.error} success={params.success} />

        <form
          action={saveProfile}
          className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <input type="hidden" name="redirectTo" value={next} />

          <div className="grid gap-5 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Full name</span>
              <input
                name="fullName"
                defaultValue={user.fullName ?? ""}
                required
                className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-emerald-600"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Phone number</span>
              <input
                name="phone"
                defaultValue={user.phone ?? ""}
                required
                placeholder="+60123456789"
                className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-emerald-600"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Email</span>
              <input
                value={user.email}
                readOnly
                className="rounded-md border border-zinc-200 bg-zinc-100 px-3 py-2 text-zinc-600"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Profile photo</span>
              <input
                name="profilePhoto"
                type="file"
                accept="image/*"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">DuitNow ID type</span>
              <select
                name="duitNowIdType"
                defaultValue={user.duitNowIdType ?? ""}
                required
                className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-emerald-600"
              >
                <option value="" disabled>
                  Select type
                </option>
                {DUITNOW_ID_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">DuitNow ID value</span>
              <input
                name="duitNowIdValue"
                defaultValue={user.duitNowIdValue ?? ""}
                required
                className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-emerald-600"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">DuitNow recipient name</span>
              <input
                name="duitNowRecipientName"
                defaultValue={user.duitNowRecipientName ?? ""}
                required
                placeholder="Name shown on bank receipts"
                className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-emerald-600"
              />
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
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
              <p className="text-sm text-zinc-500">
                Required for reminders. Upload a new image to replace the saved QR.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {user.profilePhotoUrl ? (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Current photo</span>
                  <img
                    src={user.profilePhotoUrl}
                    alt="Current profile"
                    className="aspect-square rounded-md border border-zinc-200 object-cover"
                  />
                </div>
              ) : null}

              {user.duitNowQrUrl ? (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Current QR</span>
                  <img
                    src={user.duitNowQrUrl}
                    alt="Current DuitNow QR"
                    className="aspect-square rounded-md border border-zinc-200 object-cover"
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <SubmitButton pendingLabel="Saving profile...">
              {completed ? "Save profile" : "Save profile details"}
            </SubmitButton>
          </div>
        </form>

        <WhatsAppLinkPanel
          profileReady={profileReady}
          redirectTo={next}
          phone={user.phone}
          initialStatus={user.whatsappLinkStatus}
          initialLinkedPhone={user.whatsappLinkedPhone}
          initialError={user.whatsappLinkError}
          initialLinkedAt={user.whatsappLinkedAt?.toISOString() ?? null}
        />
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
