"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "danger" | "secondary";
  className?: string;
};

export default function SubmitButton({
  children,
  pendingLabel = "Saving...",
  variant = "primary",
  className = "",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const variantClass =
    variant === "danger"
      ? "border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:bg-red-50"
      : variant === "secondary"
        ? "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100"
        : "bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-emerald-600";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-5 py-2 font-medium disabled:cursor-wait ${variantClass} ${className}`}
    >
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
