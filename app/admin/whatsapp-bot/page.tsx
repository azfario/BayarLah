import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import StatusToast from "@/components/StatusToast";
import BrandLogo from "@/components/BrandLogo";
import { prisma } from "@/lib/db";
import { getWhatsappBotSession, isWhatsappBotAdminEmail } from "@/lib/whatsapp-bot";
import WhatsAppBotPanel from "./WhatsAppBotPanel";

export const dynamic = "force-dynamic";

type WhatsAppBotAdminPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function WhatsAppBotAdminPage({
  searchParams,
}: WhatsAppBotAdminPageProps) {
  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
  if (!isWhatsappBotAdminEmail(email)) notFound();

  const params = await searchParams;
  const session = await getWhatsappBotSession(prisma);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <BrandLogo
              href="/admin/whatsapp-bot"
              className="text-sm"
              label="BayarLah Admin"
            />
            <h1 className="text-3xl font-bold">WhatsApp bot</h1>
          </div>
          <UserButton />
        </header>

        <StatusToast error={params.error} success={params.success} />

        <WhatsAppBotPanel
          initialState={{
            status: session?.status ?? "NOT_LINKED",
            sessionId: session?.sessionId ?? null,
            qrImageDataUrl: null,
            linkedPhone: session?.linkedPhone ?? null,
            errorMessage: session?.linkError ?? null,
            updatedAt: session?.updatedAt?.toISOString() ?? null,
          }}
        />
      </div>
    </main>
  );
}
