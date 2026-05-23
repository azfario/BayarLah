"use server";

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { DuitNowIdType } from "@prisma/client";
import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isDuitNowIdType } from "@/lib/duitnow";
import { normalizeMalaysianPhone } from "@/lib/friends";
import { createOpenWaSession, startOpenWaSession } from "@/lib/openwa";
import { hasProfileDetails } from "@/lib/profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PROFILE_PHOTOS_BUCKET = "profile-photos";
const DUITNOW_QRS_BUCKET = "duitnow-qrs";
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export async function saveProfile(formData: FormData) {
  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

  const redirectTo = getSafeRedirect(formData.get("redirectTo"));
  const fullName = getString(formData.get("fullName"));
  const phone = normalizeMalaysianPhone(getString(formData.get("phone")));
  const duitNowIdType = getString(formData.get("duitNowIdType"));
  const duitNowIdValue = getString(formData.get("duitNowIdValue"));
  const profilePhoto = getUploadedFile(formData.get("profilePhoto"));
  const duitNowQr = getUploadedFile(formData.get("duitNowQr"));
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";

  const existingUser = await prisma.user.findUnique({
    where: { clerkId: clerkUser.id },
  });

  if (!fullName || !phone || !duitNowIdValue || !isDuitNowIdType(duitNowIdType)) {
    redirectToProfile("Please complete all required profile fields.", redirectTo);
  }

  if (!duitNowQr && !existingUser?.duitNowQrUrl) {
    redirectToProfile("Please upload your DuitNow QR image.", redirectTo);
  }

  const phoneChanged = Boolean(existingUser?.phone && existingUser.phone !== phone);
  const nextWhatsAppStatus = phoneChanged
    ? "NOT_LINKED"
    : existingUser?.whatsappLinkStatus ?? "NOT_LINKED";
  const profileCompletedAt =
    nextWhatsAppStatus === "LINKED"
      ? existingUser?.profileCompletedAt ?? new Date()
      : null;

  const profilePhotoUrl = profilePhoto
    ? await uploadImage(
        profilePhoto,
        PROFILE_PHOTOS_BUCKET,
        clerkUser.id,
        redirectTo
      )
    : existingUser?.profilePhotoUrl ?? null;
  const duitNowQrUrl = duitNowQr
    ? await uploadImage(
        duitNowQr,
        DUITNOW_QRS_BUCKET,
        clerkUser.id,
        redirectTo
      )
    : existingUser?.duitNowQrUrl ?? null;

  await prisma.user.upsert({
    where: { clerkId: clerkUser.id },
    update: {
      email,
      fullName,
      phone,
      profilePhotoUrl,
      duitNowIdType: duitNowIdType as DuitNowIdType,
      duitNowIdValue,
      duitNowQrUrl,
      profileCompletedAt,
      ...(phoneChanged
        ? {
            whatsappLinkStatus: "NOT_LINKED" as const,
            whatsappSessionId: null,
            whatsappLinkedPhone: null,
            whatsappLinkedAt: null,
            whatsappLinkError: null,
          }
        : {}),
    },
    create: {
      clerkId: clerkUser.id,
      email,
      fullName,
      phone,
      profilePhotoUrl,
      duitNowIdType: duitNowIdType as DuitNowIdType,
      duitNowIdValue,
      duitNowQrUrl,
      whatsappLinkStatus: "NOT_LINKED",
      profileCompletedAt: null,
    },
  });

  revalidatePath("/profile");

  if (nextWhatsAppStatus !== "LINKED") {
    redirectToProfile(
      phoneChanged
        ? "Profile saved. Link WhatsApp again because your phone number changed."
        : "Profile details saved. Link WhatsApp to finish setup.",
      redirectTo,
      "success"
    );
  }

  redirect(redirectTo);
}

export async function startWhatsAppLink(formData: FormData) {
  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

  const redirectTo = getSafeRedirect(formData.get("redirectTo"));
  const user = await prisma.user.findUnique({
    where: { clerkId: clerkUser.id },
  });

  if (!user || !hasProfileDetails(user)) {
    redirectToProfile("Save your profile details before linking WhatsApp.", redirectTo);
  }

  let sessionId: string;

  try {
    const session = await createOpenWaSession(createWhatsAppSessionName(user.id));
    if (!session.id) throw new Error("OpenWA Gateway did not return a session ID.");
    sessionId = session.id;
  } catch (error) {
    redirectToProfile(getErrorMessage(error), redirectTo);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      whatsappLinkStatus: "LINKING",
      whatsappSessionId: sessionId,
      whatsappLinkedPhone: null,
      whatsappLinkedAt: null,
      whatsappLinkError: null,
      profileCompletedAt: null,
    },
  });

  try {
    await startOpenWaSession(sessionId);
  } catch (error) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        whatsappLinkStatus: "FAILED",
        whatsappLinkError: getErrorMessage(error),
      },
    });

    redirectToProfile(getErrorMessage(error), redirectTo);
  }

  revalidatePath("/profile");
  redirectToProfile(
    "WhatsApp link started. Scan the QR code to finish onboarding.",
    redirectTo,
    "success"
  );
}

function getString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function getUploadedFile(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return null;
  return value;
}

function getSafeRedirect(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/")) return "/dashboard";
  if (value.startsWith("//")) return "/dashboard";
  return value;
}

async function uploadImage(
  file: File,
  bucket: string,
  clerkUserId: string,
  redirectTo: string
) {
  if (!file.type.startsWith("image/")) {
    redirectToProfile("Please upload an image file.", redirectTo);
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    redirectToProfile("Please upload an image smaller than 5 MB.", redirectTo);
  }

  const supabase = createServerSupabaseClient();
  const extension = getImageExtension(file);
  const path = `${clerkUserId}/${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function getImageExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  const fromType = file.type.split("/").pop()?.toLowerCase();
  return (fromName || fromType || "jpg").replace(/[^a-z0-9]/g, "") || "jpg";
}

function createWhatsAppSessionName(userId: string) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `bayarlah-${safeUserId}-${randomUUID()}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function redirectToProfile(
  message: string,
  redirectTo: string,
  kind: "error" | "success" = "error"
): never {
  redirect(
    `/profile?${kind}=${encodeURIComponent(message)}&next=${encodeURIComponent(
      redirectTo
    )}`
  );
}
