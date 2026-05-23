"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import SubmitButton from "@/components/SubmitButton";
import { startWhatsAppLink } from "@/lib/actions/profile";

type WhatsAppLinkStatus = "NOT_LINKED" | "LINKING" | "LINKED" | "FAILED";

type LinkState = {
  status: WhatsAppLinkStatus;
  qrImageDataUrl: string | null;
  linkedPhone: string | null;
  errorMessage: string | null;
  updatedAt: string | null;
};

type WhatsAppLinkPanelProps = {
  profileReady: boolean;
  redirectTo: string;
  phone: string | null;
  initialStatus: WhatsAppLinkStatus;
  initialLinkedPhone: string | null;
  initialError: string | null;
  initialLinkedAt: string | null;
};

export default function WhatsAppLinkPanel({
  profileReady,
  redirectTo,
  phone,
  initialStatus,
  initialLinkedPhone,
  initialError,
  initialLinkedAt,
}: WhatsAppLinkPanelProps) {
  const [state, setState] = useState<LinkState>({
    status: initialStatus,
    qrImageDataUrl: null,
    linkedPhone: initialLinkedPhone,
    errorMessage: initialError,
    updatedAt: initialLinkedAt,
  });

  useEffect(() => {
    if (!profileReady || state.status !== "LINKING") return;

    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/whatsapp-link/status", {
          cache: "no-store",
        });
        if (!response.ok) return;

        const nextState = (await response.json()) as LinkState;
        if (!cancelled) {
          setState({
            status: nextState.status,
            qrImageDataUrl: nextState.qrImageDataUrl,
            linkedPhone: nextState.linkedPhone,
            errorMessage: nextState.errorMessage,
            updatedAt: nextState.updatedAt,
          });
        }
      } catch {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            errorMessage: "Unable to reach OpenWA Gateway.",
          }));
        }
      }
    }

    void poll();
    const interval = window.setInterval(() => void poll(), 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [profileReady, state.status]);

  const linked = state.status === "LINKED";
  const linking = state.status === "LINKING";
  const failed = state.status === "FAILED";

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700">WhatsApp</p>
          <h2 className="text-xl font-semibold">Link WhatsApp Web</h2>
          <p className="mt-2 max-w-xl text-sm text-zinc-500">
            {linked
              ? `Connected${state.linkedPhone ? ` to ${state.linkedPhone}` : ""}.`
              : profileReady
                ? `Link the WhatsApp account for ${phone ?? "this profile"} before finishing setup.`
                : "Save your profile details and DuitNow QR before linking WhatsApp."}
          </p>
        </div>

        <span
          className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${
            linked
              ? "bg-emerald-100 text-emerald-700"
              : linking
                ? "bg-amber-100 text-amber-700"
                : failed
                  ? "bg-red-100 text-red-700"
                  : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {linked
            ? "Linked"
            : linking
              ? "Waiting for scan"
              : failed
                ? "Failed"
                : "Not linked"}
        </span>
      </div>

      {linking ? (
        <div className="mt-5 grid gap-5 md:grid-cols-[240px_1fr] md:items-center">
          <div className="flex aspect-square w-full max-w-60 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50">
            {state.qrImageDataUrl ? (
              <Image
                src={state.qrImageDataUrl}
                alt="WhatsApp Web QR code"
                width={240}
                height={240}
                unoptimized
                className="h-full w-full rounded-md object-contain"
              />
            ) : (
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" />
            )}
          </div>
          <div className="text-sm text-zinc-600">
            <p>Open WhatsApp on your phone, choose linked devices, then scan this QR.</p>
            {state.errorMessage ? (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                {state.errorMessage}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {failed && state.errorMessage ? (
        <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.errorMessage}
        </p>
      ) : null}

      {linked ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <p className="text-sm text-zinc-500">
            WhatsApp is ready for reminder sending.
          </p>
          <Link
            href={redirectTo}
            className="inline-flex items-center justify-center rounded-md bg-emerald-700 px-5 py-2 font-medium text-white hover:bg-emerald-800"
          >
            Continue
          </Link>
        </div>
      ) : null}

      <form action={startWhatsAppLink} className="mt-5">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        {profileReady ? (
          <SubmitButton
            pendingLabel="Starting link..."
            variant={linked ? "secondary" : "primary"}
          >
            {linked ? "Relink WhatsApp" : failed ? "Try again" : "Start WhatsApp link"}
          </SubmitButton>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex cursor-not-allowed items-center justify-center rounded-md bg-zinc-200 px-5 py-2 font-medium text-zinc-500"
          >
            Save profile details first
          </button>
        )}
      </form>
    </section>
  );
}
