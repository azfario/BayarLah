import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getOpenWaLinkedPhone,
  getOpenWaQrImageDataUrl,
  getOpenWaSessionQr,
  mapOpenWaSessionStatus,
  recoverOpenWaSession,
} from "@/lib/openwa";
import {
  getWhatsappBotSession,
  isWhatsappBotAdminEmail,
  updateWhatsappBotSessionStatus,
} from "@/lib/whatsapp-bot";

export const dynamic = "force-dynamic";

export async function GET() {
  const clerkUser = await currentUser();
  if (!clerkUser) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
  if (!isWhatsappBotAdminEmail(email)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const storedSession = await getWhatsappBotSession(prisma);
  if (!storedSession?.sessionId) {
    return NextResponse.json({
      status: storedSession?.status ?? "NOT_LINKED",
      sessionId: null,
      qrImageDataUrl: null,
      linkedPhone: storedSession?.linkedPhone ?? null,
      errorMessage: storedSession?.linkError ?? null,
      updatedAt: storedSession?.updatedAt?.toISOString() ?? null,
    });
  }

  try {
    const session = await recoverOpenWaSession(storedSession.sessionId);
    const status = mapOpenWaSessionStatus(session.status);
    const linkedPhone = getOpenWaLinkedPhone(session);

    if (status === "LINKED") {
      const linkedAt = storedSession.linkedAt ?? new Date();
      await updateWhatsappBotSessionStatus(prisma, {
        sessionId: storedSession.sessionId,
        status: "LINKED",
        linkedPhone,
        linkedAt,
        linkError: null,
      });

      return NextResponse.json({
        status,
        sessionId: storedSession.sessionId,
        qrImageDataUrl: null,
        linkedPhone,
        errorMessage: null,
        updatedAt: new Date().toISOString(),
      });
    }

    if (status === "FAILED" || status === "NOT_LINKED") {
      const errorMessage =
        status === "FAILED"
          ? "OpenWA bot session failed. Start it again."
          : "OpenWA bot session is disconnected. Start it again.";

      await updateWhatsappBotSessionStatus(prisma, {
        sessionId: storedSession.sessionId,
        status,
        linkedPhone: null,
        linkedAt: null,
        linkError: errorMessage,
      });

      return NextResponse.json({
        status,
        sessionId: storedSession.sessionId,
        qrImageDataUrl: null,
        linkedPhone: null,
        errorMessage,
        updatedAt: new Date().toISOString(),
      });
    }

    await updateWhatsappBotSessionStatus(prisma, {
      sessionId: storedSession.sessionId,
      status: "LINKING",
      linkedPhone: null,
      linkedAt: null,
      linkError: null,
    });
    const qr = await getOpenWaSessionQr(storedSession.sessionId).catch(() => null);

    return NextResponse.json({
      status: "LINKING",
      sessionId: storedSession.sessionId,
      qrImageDataUrl: getOpenWaQrImageDataUrl(qr),
      linkedPhone: null,
      errorMessage: null,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    await updateWhatsappBotSessionStatus(prisma, {
      sessionId: storedSession.sessionId,
      status: "FAILED",
      linkedPhone: null,
      linkedAt: null,
      linkError: errorMessage,
    });

    return NextResponse.json({
      status: "FAILED",
      sessionId: storedSession.sessionId,
      qrImageDataUrl: null,
      linkedPhone: null,
      errorMessage,
      updatedAt: new Date().toISOString(),
    });
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to reach OpenWA Gateway.";
}
