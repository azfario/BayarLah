import Link from "next/link";
import type { ReactNode } from "react";

export const bayarlahAuthAppearance = {
  layout: {
    logoPlacement: "none",
    socialButtonsVariant: "blockButton",
  },
  variables: {
    borderRadius: "0.75rem",
    colorBackground: "#ffffff",
    // colorBorder: "#3e7af3",
    colorDanger: "#d45656",
    colorForeground: "#0a0a0a",
    colorInput: "#ffffff",
    colorInputForeground: "#0a0a0a",
    colorMuted: "#f7f8fa",
    colorMutedForeground: "#5f5f5f",
    colorPrimary: "#0a0a0a",
    colorPrimaryForeground: "#ffffff",
    colorRing: "#1d4ed8",
    fontFamily: "var(--font-dm-sans), Arial, Helvetica, sans-serif",
    fontFamilyButtons: "var(--font-dm-sans), Arial, Helvetica, sans-serif",
    spacing: "1rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card:
      "w-full rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-none sm:p-8",
    headerTitle: "text-2xl font-semibold text-[#0a0a0a]",
    headerSubtitle: "text-sm leading-6 text-[#5f5f5f]",
    socialButtonsBlockButton:
      "h-11 rounded-full border border-[#e5e7eb] bg-white text-sm font-semibold text-[#0a0a0a] shadow-none",
    dividerLine: "bg-[#e5e7eb]",
    dividerText: "text-xs font-medium text-[#8e8e93]",
    formFieldLabel: "text-sm font-semibold text-[#222222]",
    formFieldInput:
      "h-11 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[#0a0a0a] shadow-none focus:border-[#1d4ed8] focus:shadow-none",
    formFieldAction: "text-sm font-semibold text-[#1d4ed8]",
    formButtonPrimary:
      "h-11 rounded-full bg-[#0a0a0a] text-sm font-semibold text-white shadow-none hover:bg-[#222222]",
    footerActionText: "text-sm text-[#5f5f5f]",
    footerActionLink: "text-sm font-semibold text-[#0a0a0a]",
  },
} as const;

type AuthPageShellProps = {
  children: ReactNode;
  description: string;
  eyebrow: string;
  mode: "sign-in" | "sign-up";
  title: string;
};

const highlights = [
  { label: "Receipts", value: "Split" },
  { label: "Friends", value: "Saved" },
  { label: "Reminders", value: "Gentle" },
];

export default function AuthPageShell({
  children,
  description,
  eyebrow,
  mode,
  title,
}: AuthPageShellProps) {
  const alternate =
    mode === "sign-up"
      ? { href: "/sign-in", label: "Sign in" }
      : { href: "/sign-up", label: "Create account" };

  return (
    <main className="min-h-screen bg-white text-[#0a0a0a]">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(320px,0.9fr)_minmax(360px,1fr)] lg:px-8">
        <section className="hidden rounded-[32px] bg-[#0a0a0a] p-8 text-white lg:flex lg:flex-col lg:justify-between">
          <Link href="/" className="flex items-center gap-3 text-sm font-semibold">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#0a0a0a]">
              B
            </span>
            <span>BayarLah</span>
          </Link>

          <div>
            <p className="mb-5 inline-flex rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-white">
              {eyebrow}
            </p>
            <h1 className="max-w-md text-5xl font-semibold leading-tight">
              Settle group spending without the awkward follow-up.
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-white/70">
              Split bills, track unpaid shares, and keep your collection flow
              tidy from the first expense.
            </p>
          </div>

          <div className="grid gap-3">
            {highlights.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between border-t border-white/15 pt-4"
              >
                <span className="text-sm text-white/65">{item.label}</span>
                <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#0a0a0a]">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-h-full flex-col">
          <header className="flex items-center justify-between lg:hidden">
            <Link href="/" className="flex items-center gap-3 text-sm font-semibold">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#0a0a0a] text-white">
                B
              </span>
              <span>BayarLah</span>
            </Link>
            <Link
              href={alternate.href}
              className="rounded-full border border-[#e5e7eb] px-4 py-2 text-sm font-semibold text-[#0a0a0a]"
            >
              {alternate.label}
            </Link>
          </header>

          <div className="hidden justify-end pt-2 lg:flex">
            <Link
              href={alternate.href}
              className="rounded-full border border-[#e5e7eb] px-5 py-2.5 text-sm font-semibold text-[#0a0a0a]"
            >
              {alternate.label}
            </Link>
          </div>

          <div className="flex flex-1 items-center justify-center py-10 lg:py-0">
            <div className="w-full max-w-[430px]">
              <div className="mb-7">
                <p className="text-sm font-semibold text-[#ff5530]">
                  {eyebrow}
                </p>
                <h2 className="mt-3 text-4xl font-semibold leading-tight text-[#0a0a0a]">
                  {title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#5f5f5f]">
                  {description}
                </p>
              </div>
              {children}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
