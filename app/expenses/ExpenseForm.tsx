"use client";

import { useMemo, useState } from "react";
import ReminderFrequencyPicker from "@/components/ReminderFrequencyPicker";
import SubmitButton from "@/components/SubmitButton";
import { createExpense } from "@/lib/actions/expenses";
import { formatMoney, parseMoneyToCents } from "@/lib/money";

type FriendOption = {
  id: string;
  name: string;
  phone: string;
};

type SplitMode = "EQUAL_SPLIT" | "CUSTOM_AMOUNT";

type ExpenseFormProps = {
  friends: FriendOption[];
};

type InlineFriendRow = {
  key: string;
  name: string;
  phone: string;
  owedAmount: string;
};

export default function ExpenseForm({ friends }: ExpenseFormProps) {
  const [splitMode, setSplitMode] = useState<SplitMode>("EQUAL_SPLIT");
  const [totalAmount, setTotalAmount] = useState("");
  const [collectorAmount, setCollectorAmount] = useState("");
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [owedAmounts, setOwedAmounts] = useState<Record<string, string>>({});
  const [inlineFriends, setInlineFriends] = useState<InlineFriendRow[]>([
    createInlineFriendRow(1),
  ]);

  const selectedFriends = useMemo(
    () => friends.filter((friend) => selectedFriendIds.includes(friend.id)),
    [friends, selectedFriendIds]
  );
  const searchableFriends = useMemo(() => {
    const query = friendSearch.trim().toLowerCase();

    return friends
      .filter((friend) => !selectedFriendIds.includes(friend.id))
      .filter((friend) => {
        if (!query) return true;
        return (
          friend.name.toLowerCase().includes(query) ||
          friend.phone.toLowerCase().includes(query)
        );
      })
      .slice(0, 8);
  }, [friendSearch, friends, selectedFriendIds]);
  const completeInlineFriends = inlineFriends.filter(
    (friend) => friend.name.trim() && friend.phone.trim()
  );
  const debtorCount = selectedFriends.length + completeInlineFriends.length;
  const totalCents = parseMoneyToCents(totalAmount) ?? 0;
  const equalShareCents =
    splitMode === "EQUAL_SPLIT" && debtorCount > 0
      ? Math.round(totalCents / (debtorCount + 1))
      : 0;
  const customTotalCents =
    (parseMoneyToCents(collectorAmount) ?? 0) +
    selectedFriends.reduce(
      (sum, friend) => sum + (parseMoneyToCents(owedAmounts[friend.id] ?? "") ?? 0),
      0
    ) +
    completeInlineFriends.reduce(
      (sum, friend) => sum + (parseMoneyToCents(friend.owedAmount) ?? 0),
      0
    );
  const showCustomWarning =
    splitMode === "CUSTOM_AMOUNT" &&
    totalCents > 0 &&
    customTotalCents > 0 &&
    customTotalCents !== totalCents;

  function addSelectedFriend(friendId: string) {
    setSelectedFriendIds((current) =>
      current.includes(friendId) ? current : [...current, friendId]
    );
    setFriendSearch("");
  }

  function removeSelectedFriend(friendId: string) {
    setSelectedFriendIds((current) => current.filter((id) => id !== friendId));
    setOwedAmounts((current) => {
      const next = { ...current };
      delete next[friendId];
      return next;
    });
  }

  function addInlineFriend() {
    setInlineFriends((current) => [
      ...current,
      createInlineFriendRow(getNextInlineFriendNumber(current)),
    ]);
  }

  function updateInlineFriend(
    key: string,
    field: keyof Omit<InlineFriendRow, "key">,
    value: string
  ) {
    setInlineFriends((current) =>
      current.map((friend) =>
        friend.key === key ? { ...friend, [field]: value } : friend
      )
    );
  }

  function removeInlineFriend(key: string) {
    setInlineFriends((current) =>
      current.length === 1
        ? [createInlineFriendRow(1)]
        : current.filter((friend) => friend.key !== key)
    );
  }

  return (
    <form
      action={createExpense}
      className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Description</span>
          <input
            name="description"
            required
            placeholder="Dinner at mamak"
            className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Total paid</span>
          <input
            name="totalAmount"
            type="number"
            min="0"
            step="0.01"
            required
            value={totalAmount}
            onChange={(event) => setTotalAmount(event.target.value)}
            placeholder="65.00"
            className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
          />
        </label>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium">Split mode</legend>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#e5e7eb] bg-[#f7f8fa] p-4">
            <input
              type="radio"
              name="splitMode"
              value="EQUAL_SPLIT"
              checked={splitMode === "EQUAL_SPLIT"}
              onChange={() => setSplitMode("EQUAL_SPLIT")}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">Equal split</span>
              <span className="block text-sm text-zinc-500">
                Shared bill split across you and selected friends.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#e5e7eb] bg-[#f7f8fa] p-4">
            <input
              type="radio"
              name="splitMode"
              value="CUSTOM_AMOUNT"
              checked={splitMode === "CUSTOM_AMOUNT"}
              onChange={() => setSplitMode("CUSTOM_AMOUNT")}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">Custom amounts</span>
              <span className="block text-sm text-zinc-500">
                Each friend owes their own purchase amount.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <section className="mt-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-medium">Saved friends</h2>
          {splitMode === "EQUAL_SPLIT" && equalShareCents > 0 ? (
            <span className="text-sm text-[#1d4ed8] sm:text-right">
              Each selected friend owes {formatMoney(equalShareCents / 100)}
            </span>
          ) : null}
        </div>

        {friends.length > 0 ? (
          <div className="mt-3 grid gap-3">
            <div className="relative">
              <input
                value={friendSearch}
                onChange={(event) => setFriendSearch(event.target.value)}
                placeholder="Search by name or phone"
                className="h-10 w-full rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
              />
              <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-[#e5e7eb] bg-white shadow-sm">
                {searchableFriends.length > 0 ? (
                  searchableFriends.map((friend) => (
                    <button
                      key={friend.id}
                      type="button"
                      onClick={() => addSelectedFriend(friend.id)}
                      className="flex min-w-0 w-full items-center justify-between gap-4 border-b border-[#eaecf0] px-3 py-2 text-left last:border-b-0 hover:bg-[#f7f8fa]"
                    >
                      <span className="min-w-0">
                        <span className="block break-words font-medium">{friend.name}</span>
                        <span className="block break-all text-sm text-zinc-500">{friend.phone}</span>
                      </span>
                      <span className="text-sm font-medium text-[#0a0a0a]">Add</span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-sm text-zinc-500">
                    No saved friends found.
                  </p>
                )}
              </div>
            </div>

            {selectedFriends.length > 0 ? (
              <div className="grid gap-3">
                {selectedFriends.map((friend) => (
                  <div
                    key={friend.id}
                    className="grid gap-3 rounded-lg border border-[#e5e7eb] bg-[#f7f8fa] p-4 md:grid-cols-[1fr_180px_auto]"
                  >
                    <input type="hidden" name="friendIds" value={friend.id} />
                    <div className="min-w-0">
                      <p className="break-words font-medium">{friend.name}</p>
                      <p className="break-all text-sm text-zinc-500">{friend.phone}</p>
                    </div>

                    {splitMode === "CUSTOM_AMOUNT" ? (
                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-medium text-zinc-500">Owes</span>
                        <input
                          name={`owedAmount:${friend.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={owedAmounts[friend.id] ?? ""}
                          onChange={(event) =>
                            setOwedAmounts((current) => ({
                              ...current,
                              [friend.id]: event.target.value,
                            }))
                          }
                          placeholder="25.00"
                          className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
                        />
                      </label>
                    ) : (
                      <div className="hidden md:block" />
                    )}

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeSelectedFriend(friend.id)}
                        className="w-full rounded-full border border-[#0a0a0a] bg-white px-6 py-[11px] text-sm font-semibold text-[#0a0a0a] hover:bg-[#f7f8fa] sm:w-auto"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                Search and add saved friends, or add new friends inline below.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">
            No saved friends yet. Add one inline below or visit the friends page.
          </p>
        )}
      </section>

      <section className="mt-5 rounded-lg border border-[#e5e7eb] bg-[#f7f8fa] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-medium">Add new friends inline</h2>
          <button
            type="button"
            onClick={addInlineFriend}
            className="w-full rounded-full border border-[#0a0a0a] bg-white px-6 py-[11px] text-sm font-semibold text-[#0a0a0a] hover:bg-white sm:w-auto"
          >
            + Add friend
          </button>
        </div>

        <div className="mt-3 grid gap-4">
          {inlineFriends.map((friend, index) => {
            const active =
              friend.name.trim() !== "" ||
              friend.phone.trim() !== "" ||
              friend.owedAmount.trim() !== "";

            return (
              <div
                key={friend.key}
                className="grid gap-4 rounded-lg border border-[#e5e7eb] bg-[#f2f3f5] p-4 md:grid-cols-[1fr_1fr_160px_auto]"
              >
                <input type="hidden" name="inlineFriendKeys" value={friend.key} />

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Name</span>
                  <input
                    name={`inlineFriendName:${friend.key}`}
                    required={active}
                    value={friend.name}
                    onChange={(event) =>
                      updateInlineFriend(friend.key, "name", event.target.value)
                    }
                    placeholder="Nur Aisyah"
                    className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium">WhatsApp phone</span>
                  <input
                    name={`inlineFriendPhone:${friend.key}`}
                    required={active}
                    value={friend.phone}
                    onChange={(event) =>
                      updateInlineFriend(friend.key, "phone", event.target.value)
                    }
                    placeholder="0123456789"
                    className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
                  />
                </label>

                {splitMode === "CUSTOM_AMOUNT" ? (
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-medium">Owes</span>
                    <input
                      name={`inlineFriendOwedAmount:${friend.key}`}
                      type="number"
                      min="0"
                      step="0.01"
                      required={active}
                      value={friend.owedAmount}
                      onChange={(event) =>
                        updateInlineFriend(
                          friend.key,
                          "owedAmount",
                          event.target.value
                        )
                      }
                      placeholder="25.00"
                      className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
                    />
                  </label>
                ) : (
                  <div className="hidden md:block" />
                )}

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => removeInlineFriend(friend.key)}
                    className="w-full rounded-full border border-[#0a0a0a] bg-white px-6 py-[11px] text-sm font-semibold text-[#0a0a0a] hover:bg-white sm:w-auto"
                  >
                    {inlineFriends.length === 1 && index === 0 ? "Clear" : "Remove"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {splitMode === "CUSTOM_AMOUNT" ? (
        <section className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Your own amount</span>
            <input
              name="collectorAmount"
              type="number"
              min="0"
              step="0.01"
              required
              value={collectorAmount}
              onChange={(event) => setCollectorAmount(event.target.value)}
              placeholder="15.00"
              className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
            />
          </label>

          <div className="rounded-lg border border-[#e5e7eb] bg-[#f7f8fa] px-4 py-3 text-sm text-zinc-600">
            Enter your own purchase amount plus what each friend owes. BayarLah will still save if the numbers do not match the total.
          </div>
        </section>
      ) : null}

      {showCustomWarning ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          These amounts add up to {formatMoney(customTotalCents / 100)}, but the total paid is{" "}
          {formatMoney(totalCents / 100)}. You can still save this expense.
        </div>
      ) : null}

      <ReminderFrequencyPicker className="mt-5" />

      <div className="mt-6 flex justify-stretch sm:justify-end">
        <SubmitButton
          pendingLabel="Saving expense..."
          className="w-full sm:w-auto"
        >
          Save expense
        </SubmitButton>
      </div>
    </form>
  );
}

function createInlineFriendRow(number: number): InlineFriendRow {
  return {
    key: `inline-${number}`,
    name: "",
    phone: "",
    owedAmount: "",
  };
}

function getNextInlineFriendNumber(friends: InlineFriendRow[]) {
  const highest = friends.reduce((max, friend) => {
    const number = Number(friend.key.replace("inline-", ""));
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);

  return highest + 1;
}
