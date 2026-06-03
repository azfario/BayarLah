"use server";

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createOpenWaSession, startOpenWaSession } from "@/lib/openwa";
import {
  getWhatsappBotSession,
  getWhatsappBotSessionName,
  isWhatsappBotAdminEmail,
  upsertWhatsappBotSession,
} from "@/lib/whatsapp-bot";

export async function startWhatsappBotSession() {
  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
  if (!isWhatsappBotAdminEmail(email)) redirect("/dashboard");

  let sessionId: string | null = null;

  try {
    const existing = await getWhatsappBotSession(prisma);
    sessionId = existing?.sessionId ?? null;

    if (!sessionId) {
      const session = await createOpenWaSession(getWhatsappBotSessionName());
      if (!session.id) {
        throw new Error("OpenWA Gateway did not return a bot session ID.");
      }
      sessionId = session.id;
    }

    await upsertWhatsappBotSession(prisma, {
      sessionId,
      status: "LINKING",
      linkedPhone: null,
      linkedAt: null,
      linkError: null,
    });
    await startOpenWaSession(sessionId);
  } catch (error) {
    await upsertWhatsappBotSession(prisma, {
      sessionId,
      status: "FAILED",
      linkedPhone: null,
      linkedAt: null,
      linkError: getErrorMessage(error),
    });

    redirect(
      `/admin/whatsapp-bot?error=${encodeURIComponent(getErrorMessage(error))}`
    );
  }

  revalidatePath("/admin/whatsapp-bot");
  redirect(
    "/admin/whatsapp-bot?success=BayarLah bot session started. Scan the QR code to connect it."
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to start the bot session.";
}
