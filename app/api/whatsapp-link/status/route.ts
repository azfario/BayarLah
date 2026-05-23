import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureUserInDB } from "@/lib/actions/user";
import { prisma } from "@/lib/db";
import {
  deleteOpenWaSession,
  getOpenWaLinkedPhone,
  getOpenWaQrImageDataUrl,
  getOpenWaSessionQr,
  mapOpenWaSessionStatus,
  openWaPhonesMatch,
  recoverOpenWaSession,
  type WhatsAppGatewaySessionStatus,
} from "@/lib/openwa";

export const dynamic = "force-dynamic";

export async function GET() {
  const clerkUser = await currentUser();
  if (!clerkUser) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const user = await ensureUserInDB();

  if (!user.whatsappSessionId) {
    return NextResponse.json({
      status: user.whatsappLinkStatus,
      sessionId: null,
      qrImageDataUrl: null,
      linkedPhone: user.whatsappLinkedPhone,
      errorMessage: user.whatsappLinkError,
      updatedAt: null,
    });
  }

  try {
    const session = await recoverOpenWaSession(user.whatsappSessionId);
    const nextStatus = mapOpenWaSessionStatus(session.status);
    const linkedPhone = getOpenWaLinkedPhone(session);

    if (nextStatus === "LINKED") {
      if (!openWaPhonesMatch(user.phone, linkedPhone)) {
        const errorMessage = `Linked WhatsApp phone ${
          linkedPhone ?? "unknown"
        } does not match profile phone ${user.phone ?? "unknown"}.`;

        await deleteOpenWaSession(user.whatsappSessionId).catch(() => undefined);
        await updateStoredStatus(user.id, user.whatsappSessionId, {
          status: "FAILED",
          linkedPhone: null,
          errorMessage,
          completed: false,
        });

        return NextResponse.json({
          status: "FAILED",
          sessionId: user.whatsappSessionId,
          qrImageDataUrl: null,
          linkedPhone: null,
          errorMessage,
          updatedAt: null,
        } satisfies WhatsAppGatewaySessionStatus);
      }

      const updatedAt = new Date();
      await updateStoredStatus(user.id, user.whatsappSessionId, {
        status: "LINKED",
        linkedPhone: linkedPhone ?? user.whatsappLinkedPhone,
        errorMessage: null,
        completed: true,
        linkedAt: updatedAt,
      });

      return NextResponse.json({
        status: "LINKED",
        sessionId: user.whatsappSessionId,
        qrImageDataUrl: null,
        linkedPhone: linkedPhone ?? user.whatsappLinkedPhone,
        errorMessage: null,
        updatedAt: updatedAt.toISOString(),
      } satisfies WhatsAppGatewaySessionStatus);
    }

    if (nextStatus === "FAILED" || nextStatus === "NOT_LINKED") {
      const errorMessage =
        nextStatus === "FAILED"
          ? "OpenWA session failed. Start WhatsApp link again."
          : "OpenWA session is disconnected. Start WhatsApp link again.";

      await updateStoredStatus(user.id, user.whatsappSessionId, {
        status: nextStatus,
        linkedPhone: null,
        errorMessage,
        completed: false,
      });

      return NextResponse.json({
        status: nextStatus,
        sessionId: user.whatsappSessionId,
        qrImageDataUrl: null,
        linkedPhone: null,
        errorMessage,
        updatedAt: null,
      } satisfies WhatsAppGatewaySessionStatus);
    }

    const qr = await getOpenWaSessionQr(user.whatsappSessionId).catch(() => null);

    return NextResponse.json({
      status: "LINKING",
      sessionId: user.whatsappSessionId,
      qrImageDataUrl: getOpenWaQrImageDataUrl(qr),
      linkedPhone: user.whatsappLinkedPhone,
      errorMessage: user.whatsappLinkError,
      updatedAt: null,
    } satisfies WhatsAppGatewaySessionStatus);
  } catch (error) {
    return NextResponse.json({
      status: user.whatsappLinkStatus,
      sessionId: user.whatsappSessionId,
      qrImageDataUrl: null,
      linkedPhone: user.whatsappLinkedPhone,
      errorMessage: getErrorMessage(error),
      updatedAt: null,
    });
  }
}

async function updateStoredStatus(
  userId: string,
  sessionId: string,
  input: {
    status: "NOT_LINKED" | "LINKING" | "LINKED" | "FAILED";
    linkedPhone: string | null;
    errorMessage: string | null;
    completed: boolean;
    linkedAt?: Date;
  }
) {
  await prisma.user.updateMany({
    where: { id: userId, whatsappSessionId: sessionId },
    data: {
      whatsappLinkStatus: input.status,
      whatsappLinkedPhone: input.linkedPhone,
      whatsappLinkedAt: input.linkedAt ?? null,
      whatsappLinkError: input.errorMessage,
      profileCompletedAt: input.completed ? (input.linkedAt ?? new Date()) : null,
    },
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to reach OpenWA Gateway.";
}
