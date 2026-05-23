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
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            mode === "manual"
              ? "bg-emerald-700 text-white"
              : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950"
          }`}
        >
          Manual
        </button>
        <button
          type="button"
          onClick={() => setMode("receipt")}
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            mode === "receipt"
              ? "bg-emerald-700 text-white"
              : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950"
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
