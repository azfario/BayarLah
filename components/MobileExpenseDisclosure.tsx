"use client";

import { useState } from "react";

export default function MobileExpenseDisclosure({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* On md+ always show; on mobile only show when open */}
      <div className={`${open ? "block" : "hidden"} md:block`}>{children}</div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[#0a0a0a] bg-white px-4 py-2 text-sm font-semibold text-[#0a0a0a] md:hidden"
      >
        {open ? "Show less" : `Show ${count} more`}
      </button>
    </>
  );
}
