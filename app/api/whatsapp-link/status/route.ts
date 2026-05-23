import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureUserInDB } from "@/lib/actions/user";
import { getWorkerSessionStatus } from "@/lib/whatsapp-worker";

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
    const status = await getWorkerSessionStatus(user.whatsappSessionId);

    return NextResponse.json({
      status: status.status,
      sessionId: user.whatsappSessionId,
      qrImageDataUrl: status.qrImageDataUrl,
      linkedPhone: status.linkedPhone ?? user.whatsappLinkedPhone,
      errorMessage: status.errorMessage ?? user.whatsappLinkError,
      updatedAt: status.updatedAt,
    });
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to reach WhatsApp worker.";
}
