"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import BrandLogo from "@/components/BrandLogo";

type HeaderProps = {
  title: string;
  subtitle?: string;
};

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/expenses", label: "Expenses" },
  { href: "/friends", label: "Friends" },
  { href: "/profile", label: "Profile" },
];

export default function Header({ title, subtitle }: HeaderProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <header className="border-b border-[#e5e7eb] pb-6">
      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <BrandLogo href="/dashboard" className="text-sm" />
          <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-[-0.5px] text-[#0a0a0a] sm:text-5xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 break-words text-sm leading-6 text-[#5f5f5f]">{subtitle}</p>
          ) : null}
        </div>

        {/* Mobile: hamburger + avatar */}
        <div className="flex shrink-0 items-center gap-3 pt-1 md:hidden">
          <UserButton />
          <button
            type="button"
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#0a0a0a]"
          >
            {drawerOpen ? (
              /* Close X */
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="2" y1="2" x2="16" y2="16" />
                <line x1="16" y1="2" x2="2" y2="16" />
              </svg>
            ) : (
              /* Hamburger */
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="2" y1="5" x2="16" y2="5" />
                <line x1="2" y1="9" x2="16" y2="9" />
                <line x1="2" y1="13" x2="16" y2="13" />
              </svg>
            )}
          </button>
        </div>

        {/* Desktop nav */}
        <nav className="hidden shrink-0 items-center gap-2 pt-1 md:flex md:flex-wrap">
          <Link
            href="/expenses/new"
            className="inline-flex items-center justify-center rounded-full bg-[#0a0a0a] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Create expense
          </Link>
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={
                  isActive
                    ? "inline-flex items-center justify-center rounded-full border border-[#0a0a0a] bg-white px-5 py-2.5 text-sm font-semibold text-[#0a0a0a]"
                    : "inline-flex items-center justify-center rounded-full border border-[#e5e7eb] bg-white px-5 py-2.5 text-sm font-semibold text-[#0a0a0a]"
                }
              >
                {label}
              </Link>
            );
          })}
          <UserButton />
        </nav>
      </div>

      {/* Mobile drawer — inline, appears below the title row */}
      {drawerOpen ? (
        <nav className="mt-4 flex flex-col gap-2 md:hidden" aria-label="Mobile navigation">
          <Link
            href="/expenses/new"
            onClick={() => setDrawerOpen(false)}
            className="flex items-center justify-center rounded-full bg-[#0a0a0a] px-5 py-3 text-sm font-semibold text-white"
          >
            Create expense
          </Link>
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setDrawerOpen(false)}
                className={
                  isActive
                    ? "flex items-center rounded-full border border-[#0a0a0a] bg-white px-5 py-3 text-sm font-semibold text-[#0a0a0a]"
                    : "flex items-center rounded-full border border-[#e5e7eb] bg-white px-5 py-3 text-sm font-semibold text-[#0a0a0a]"
                }
              >
                {label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}
