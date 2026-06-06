"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import SubmitButton from "@/components/SubmitButton";
import {
  linkDifferentWhatsappBotNumber,
  startWhatsappBotSession,
} from "@/lib/actions/whatsapp-bot";

type BotStatus = "NOT_LINKED" | "LINKING" | "LINKED" | "FAILED";

type BotState = {
  status: BotStatus;
  sessionId: string | null;
  qrImageDataUrl: string | null;
  linkedPhone: string | null;
  errorMessage: string | null;
  updatedAt: string | null;
};

type WhatsAppBotPanelProps = {
  initialState: BotState;
};

export default function WhatsAppBotPanel({
  initialState,
}: WhatsAppBotPanelProps) {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    if (state.status !== "LINKING" && state.status !== "LINKED") return;

    let cancelled = false;
    const pollIntervalMs = state.status === "LINKING" ? 3000 : 10000;

    async function poll() {
      try {
        const response = await fetch("/api/admin/whatsapp-bot/status", {
          cache: "no-store",
        });
        if (!response.ok) return;

        const nextState = (await response.json()) as BotState;
        if (!cancelled) setState(nextState);
      } catch {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            errorMessage: "Unable to reach the bot status endpoint.",
          }));
        }
      }
    }

    void poll();
    const interval = window.setInterval(() => void poll(), pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [state.status]);

  const linked = state.status === "LINKED";
  const linking = state.status === "LINKING";
  const failed = state.status === "FAILED";

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700">WhatsApp Bot</p>
          <h2 className="text-xl font-semibold">BayarLah bot session</h2>
          <p className="mt-2 max-w-xl break-words text-sm text-zinc-500">
            {linked
              ? `Connected${state.linkedPhone ? ` to ${state.linkedPhone}` : ""}.`
              : "Connect the dedicated BayarLah WhatsApp number before sending reminders."}
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
        <div className="mt-5 grid min-w-0 gap-5 md:grid-cols-[240px_minmax(0,1fr)] md:items-center">
          <div className="mx-auto flex aspect-square w-full max-w-60 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 md:mx-0">
            {state.qrImageDataUrl ? (
              <Image
                src={state.qrImageDataUrl}
                alt="BayarLah WhatsApp bot QR code"
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
            <p>Open WhatsApp on the bot phone, choose linked devices, then scan.</p>
            {state.sessionId ? (
              <p className="mt-2 break-all text-xs text-zinc-400">
                Session: {state.sessionId}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {state.errorMessage ? (
        <p
          className={`mt-5 rounded-md border px-3 py-2 text-sm ${
            failed
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {state.errorMessage}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <form action={startWhatsappBotSession} className="w-full sm:w-auto">
          <SubmitButton
            pendingLabel="Starting bot..."
            variant={linked ? "secondary" : "primary"}
            className="w-full sm:w-auto"
          >
            {linked ? "Restart bot session" : failed ? "Try again" : "Start bot session"}
          </SubmitButton>
        </form>

        {state.sessionId ? (
          <form
            action={linkDifferentWhatsappBotNumber}
            className="w-full sm:w-auto"
            onSubmit={(event) => {
              if (
                !window.confirm(
                  "Unlink the current bot number and generate a QR code for a different number?"
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            <SubmitButton
              pendingLabel="Removing old link..."
              variant="danger"
              className="w-full sm:w-auto"
            >
              Link different number
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </section>
  );
}
