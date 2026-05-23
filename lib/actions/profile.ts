"use server";

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { DuitNowIdType } from "@prisma/client";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isDuitNowIdType } from "@/lib/duitnow";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PROFILE_PHOTOS_BUCKET = "profile-photos";
const DUITNOW_QRS_BUCKET = "duitnow-qrs";
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export async function saveProfile(formData: FormData) {
  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

  const redirectTo = getSafeRedirect(formData.get("redirectTo"));
  const fullName = getString(formData.get("fullName"));
  const phone = getString(formData.get("phone"));
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
      profileCompletedAt: new Date(),
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
      profileCompletedAt: new Date(),
    },
  });

  redirect(redirectTo);
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

function redirectToProfile(message: string, redirectTo: string) {
  redirect(
    `/profile?error=${encodeURIComponent(message)}&next=${encodeURIComponent(
      redirectTo
    )}`
  );
}
