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
        ? "border border-[#0a0a0a] bg-white text-[#0a0a0a] hover:bg-[#f7f8fa] disabled:border-[#e5e7eb] disabled:bg-[#e5e7eb] disabled:text-[#a8aab2]"
        : "bg-[#0a0a0a] text-white hover:bg-[#222222] disabled:bg-[#e5e7eb] disabled:text-[#a8aab2]";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-[11px] text-sm font-semibold disabled:cursor-wait ${variantClass} ${className}`}
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
