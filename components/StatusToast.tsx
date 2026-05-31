"use client";

import { useEffect, useState } from "react";

type StatusToastProps = {
  error?: string;
  success?: string;
};

export default function StatusToast({ error, success }: StatusToastProps) {
  const [visible, setVisible] = useState(Boolean(error || success));

  useEffect(() => {
    if (!error && !success) {
      setVisible(false);
      return;
    }

    setVisible(true);
    const timeout = window.setTimeout(() => setVisible(false), 5000);

    return () => window.clearTimeout(timeout);
  }, [error, success]);

  if (!visible || (!error && !success)) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col-reverse gap-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-full sm:max-w-sm sm:flex-col">
      {error ? (
        <div
          role="alert"
          className="pointer-events-auto flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg shadow-red-950/10"
        >
          <span>{error}</span>
          <DismissButton onDismiss={() => setVisible(false)} />
        </div>
      ) : null}

      {success ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-auto flex items-start justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-lg shadow-emerald-950/10"
        >
          <span>{success}</span>
          <DismissButton onDismiss={() => setVisible(false)} />
        </div>
      ) : null}
    </div>
  );
}

function DismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      type="button"
      aria-label="Dismiss notification"
      onClick={onDismiss}
      className="-m-1 rounded px-1.5 py-0.5 text-base leading-none opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current"
    >
      x
    </button>
  );
}
