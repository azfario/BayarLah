"use client";

import { useState } from "react";
import ExpenseForm from "@/app/expenses/ExpenseForm";
import ReceiptWizard from "@/app/expenses/receipt/ReceiptWizard";

type FriendOption = {
  id: string;
  name: string;
  phone: string;
};

type ExpenseCreateTabsProps = {
  friends: FriendOption[];
  collectorName: string;
  initialMode: "manual" | "receipt";
};

export default function ExpenseCreateTabs({
  friends,
  collectorName,
  initialMode,
}: ExpenseCreateTabsProps) {
  const [mode, setMode] = useState(initialMode);

  return (
    <section className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 rounded-full border border-[#e5e7eb] bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-full px-4 py-2 text-sm font-medium ${
            mode === "manual"
              ? "bg-[#0a0a0a] text-white"
              : "text-[#5f5f5f] hover:bg-[#f7f8fa] hover:text-[#0a0a0a]"
          }`}
        >
          Manual
        </button>
        <button
          type="button"
          onClick={() => setMode("receipt")}
          className={`rounded-full px-4 py-2 text-sm font-medium ${
            mode === "receipt"
              ? "bg-[#0a0a0a] text-white"
              : "text-[#5f5f5f] hover:bg-[#f7f8fa] hover:text-[#0a0a0a]"
          }`}
        >
          Upload receipt
        </button>
      </div>

      {mode === "manual" ? (
        <ExpenseForm friends={friends} />
      ) : (
        <ReceiptWizard friends={friends} collectorName={collectorName} />
      )}
    </section>
  );
}
