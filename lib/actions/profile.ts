"use server";

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { DuitNowIdType } from "@prisma/client";
import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isDuitNowIdType, normalizeMalaysianNric } from "@/lib/duitnow";
import {
  isValidMalaysianMobilePhone,
  normalizeMalaysianMobilePhone,
} from "@/lib/friends";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const DUITNOW_QRS_BUCKET = "duitnow-qrs";
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export async function saveProfile(formData: FormData) {
  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

  const redirectTo = getSafeRedirect(formData.get("redirectTo"));
  const fullName = getString(formData.get("fullName"));
  const rawPhone = getString(formData.get("phone"));
  const phone = normalizeMalaysianMobilePhone(rawPhone);
  const duitNowIdType = getString(formData.get("duitNowIdType"));
  const rawDuitNowIdValue = getString(formData.get("duitNowIdValue"));
  const duitNowRecipientName = getString(formData.get("duitNowRecipientName"));
  const duitNowQr = getUploadedFile(formData.get("duitNowQr"));
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";

  const existingUser = await prisma.user.findUnique({
    where: { clerkId: clerkUser.id },
  });

  if (!fullName) {
    redirectToProfile("Please enter your display name.", redirectTo);
  }

  if (!isValidMalaysianMobilePhone(phone)) {
    redirectToProfile(
      "Please enter a valid Malaysian mobile number, for example +60123456789.",
      redirectTo
    );
  }

  if (!isDuitNowIdType(duitNowIdType)) {
    redirectToProfile("Please select a DuitNow ID type.", redirectTo);
  }

  let duitNowIdValue = rawDuitNowIdValue;
  if (duitNowIdType === "PHONE") {
    duitNowIdValue = normalizeMalaysianMobilePhone(rawDuitNowIdValue);
    if (!isValidMalaysianMobilePhone(duitNowIdValue)) {
      redirectToProfile(
        "Please enter a valid DuitNow mobile number, for example +60123456789.",
        redirectTo
      );
    }
  } else if (duitNowIdType === "NRIC") {
    duitNowIdValue = normalizeMalaysianNric(rawDuitNowIdValue);
    if (!duitNowIdValue) {
      redirectToProfile(
        "Please enter a valid 12-digit NRIC, for example 900101145678.",
        redirectTo
      );
    }
  } else if (!duitNowIdValue) {
    redirectToProfile("Please enter your DuitNow ID.", redirectTo);
  }

  if (!duitNowRecipientName) {
    redirectToProfile("Please enter your DuitNow recipient name.", redirectTo);
  }

  if (!duitNowQr && !existingUser?.duitNowQrUrl) {
    redirectToProfile("Please upload your DuitNow QR image.", redirectTo);
  }

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
      duitNowIdType: duitNowIdType as DuitNowIdType,
      duitNowIdValue,
      duitNowRecipientName,
      duitNowQrUrl,
    },
    create: {
      clerkId: clerkUser.id,
      email,
      fullName,
      phone,
      duitNowIdType: duitNowIdType as DuitNowIdType,
      duitNowIdValue,
      duitNowRecipientName,
      duitNowQrUrl,
    },
  });

  revalidatePath("/profile");
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
