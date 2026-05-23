"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import ReminderFrequencyPicker from "@/components/ReminderFrequencyPicker";
import { parseReceipt, saveReceiptExpense } from "@/lib/actions/receipts";
import {
  distributeEvenly,
  distributeProportionally,
  type ProportionalBase,
} from "@/lib/receipt-calculations";
import { centsToMoneyString, formatMoney, parseMoneyToCents } from "@/lib/money";
import type {
  ParsedReceiptDraft,
  ReceiptParseState,
  ReceiptSaveState,
} from "@/lib/receipts";

type FriendOption = {
  id: string;
  name: string;
  phone: string;
};

type ReceiptWizardProps = {
  friends: FriendOption[];
  collectorName: string;
};

type SplitMode = "EQUAL_SPLIT" | "CUSTOM_AMOUNT";

type ClientReceiptDraft = {
  merchantName: string;
  receiptDate: string;
  subtotalAmount: string;
  taxAmount: string;
  serviceChargeAmount: string;
  roundingAmount: string;
  totalAmount: string;
  items: ClientReceiptItem[];
};

type ClientReceiptItem = {
  key: string;
  name: string;
  quantity: string;
  unitAmount: string;
};

type InlineFriendRow = {
  key: string;
  name: string;
  phone: string;
};

type Participant = {
  key: string;
  type: "COLLECTOR" | "FRIEND" | "INLINE_FRIEND";
  name: string;
  phone?: string;
  friendId?: string;
  inlineKey?: string;
};

type Assignment = {
  id: string;
  itemKey: string;
  participantKey: string;
};

const initialParseState: ReceiptParseState = {};
const initialSaveState: ReceiptSaveState = {};
const TARGET_RECEIPT_BYTES = 2.5 * 1024 * 1024;
const MAX_RECEIPT_DIMENSION = 1600;

export default function ReceiptWizard({
  friends,
  collectorName,
}: ReceiptWizardProps) {
  const [saveState, saveAction, isSaving] = useActionState(
    saveReceiptExpense,
    initialSaveState
  );
  const [parseState, setParseState] = useState<ReceiptParseState>(initialParseState);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState("");
  const [imageStatus, setImageStatus] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [draft, setDraft] = useState<ClientReceiptDraft | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>("EQUAL_SPLIT");
  const [description, setDescription] = useState("");
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [inlineFriends, setInlineFriends] = useState<InlineFriendRow[]>([
    createInlineFriendRow(1),
  ]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedItemKey, setSelectedItemKey] = useState("");
  const [nextAssignmentNumber, setNextAssignmentNumber] = useState(1);

  useEffect(() => {
    if (!parseState.draft) return;

    setDraft(toClientDraft(parseState.draft));
    setSplitMode("EQUAL_SPLIT");
    setDescription(parseState.draft.merchantName || "Receipt-assisted expense");
    setSelectedFriendIds([]);
    setFriendSearch("");
    setInlineFriends([createInlineFriendRow(1)]);
    setAssignments([]);
    setSelectedItemKey("");
    setNextAssignmentNumber(1);
  }, [parseState.draft]);

  useEffect(() => {
    return () => {
      if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    };
  }, [receiptPreviewUrl]);

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
  const activeInlineFriends = inlineFriends.filter(
    (friend) => friend.name.trim() || friend.phone.trim()
  );
  const completeInlineFriends = inlineFriends.filter(
    (friend) => friend.name.trim() && friend.phone.trim()
  );
  const participants = useMemo<Participant[]>(
    () => [
      {
        key: "collector",
        type: "COLLECTOR",
        name: collectorName || "You",
      },
      ...selectedFriends.map((friend) => ({
        key: `friend:${friend.id}`,
        type: "FRIEND" as const,
        name: friend.name,
        phone: friend.phone,
        friendId: friend.id,
      })),
      ...completeInlineFriends.map((friend) => ({
        key: `inline:${friend.key}`,
        type: "INLINE_FRIEND" as const,
        name: friend.name,
        phone: friend.phone,
        inlineKey: friend.key,
      })),
    ],
    [collectorName, completeInlineFriends, selectedFriends]
  );
  const review = useMemo(
    () =>
      draft
        ? buildReview({
            draft,
            splitMode,
            participants,
            assignments,
            description,
            hasIncompleteInlineFriend:
              activeInlineFriends.length !== completeInlineFriends.length,
          })
        : null,
    [
      activeInlineFriends.length,
      assignments,
      completeInlineFriends.length,
      description,
      draft,
      participants,
      splitMode,
    ]
  );
  const receiptPayload = useMemo(
    () =>
      draft && review
        ? JSON.stringify(
            buildReceiptPayload(draft, splitMode, participants, assignments)
          )
        : "",
    [assignments, draft, participants, review, splitMode]
  );

  function addSelectedFriend(friendId: string) {
    setSelectedFriendIds((current) =>
      current.includes(friendId) ? current : [...current, friendId]
    );
    setFriendSearch("");
  }

  function removeSelectedFriend(friendId: string) {
    const participantKey = `friend:${friendId}`;
    setSelectedFriendIds((current) => current.filter((id) => id !== friendId));
    removeParticipantAssignments(participantKey);
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
    removeParticipantAssignments(`inline:${key}`);
    setInlineFriends((current) =>
      current.length === 1
        ? [createInlineFriendRow(1)]
        : current.filter((friend) => friend.key !== key)
    );
  }

  function removeParticipantAssignments(participantKey: string) {
    setAssignments((current) =>
      current.filter((assignment) => assignment.participantKey !== participantKey)
    );
  }

  function updateDraftField(
    field: keyof Omit<ClientReceiptDraft, "items">,
    value: string
  ) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  function updateItem(
    key: string,
    field: keyof Omit<ClientReceiptItem, "key">,
    value: string
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.key === key ? { ...item, [field]: value } : item
            ),
          }
        : current
    );

    if (field === "quantity") {
      const quantity = parseQuantity(value);
      if (quantity !== null) {
        setAssignments((current) => trimAssignmentsForItem(current, key, quantity));
      }
    }
  }

  function addItem() {
    setDraft((current) =>
      current
        ? {
            ...current,
            items: [
              ...current.items,
              {
                key: `item-${getNextItemNumber(current.items)}`,
                name: "",
                quantity: "1",
                unitAmount: "",
              },
            ],
          }
        : current
    );
  }

  function removeItem(key: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            items:
              current.items.length === 1
                ? current.items
                : current.items.filter((item) => item.key !== key),
          }
        : current
    );
    setAssignments((current) =>
      current.filter((assignment) => assignment.itemKey !== key)
    );
    setSelectedItemKey((current) => (current === key ? "" : current));
  }

  function assignSelectedItem(participantKey: string) {
    if (!draft || !selectedItemKey) return;

    const item = draft.items.find((current) => current.key === selectedItemKey);
    if (!item || getRemainingQuantity(item, assignments) <= 0) return;

    const assignmentId = `assignment-${nextAssignmentNumber}`;
    setNextAssignmentNumber((current) => current + 1);
    setAssignments((current) => [
      ...current,
      { id: assignmentId, itemKey: selectedItemKey, participantKey },
    ]);

    if (getRemainingQuantity(item, assignments) <= 1) {
      setSelectedItemKey("");
    }
  }

  function removeAssignment(assignmentId: string) {
    setAssignments((current) =>
      current.filter((assignment) => assignment.id !== assignmentId)
    );
  }

  function updateReceiptFile(file: File | null) {
    setReceiptFile(file);
    setDraft(null);
    setParseState(initialParseState);
    setImageStatus("");
    setReceiptPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : "";
    });
  }

  async function handleReceiptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!receiptFile) {
      setParseState({ error: "Please upload or capture a receipt image." });
      return;
    }

    setIsParsing(true);
    setParseState(initialParseState);

    try {
      const compressedFile = await compressReceiptImage(receiptFile);
      const formData = new FormData();
      formData.append("receiptImage", compressedFile);

      if (compressedFile.size < receiptFile.size) {
        setImageStatus(
          `Compressed ${formatBytes(receiptFile.size)} to ${formatBytes(
            compressedFile.size
          )} before OCR.`
        );
      } else {
        setImageStatus(`Using ${formatBytes(compressedFile.size)} image for OCR.`);
      }

      const result = await parseReceipt(initialParseState, formData);
      setParseState(result);
    } catch (error) {
      setParseState({ error: getClientErrorMessage(error) });
    } finally {
      setIsParsing(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <form
          onSubmit={handleReceiptSubmit}
          className="grid gap-4 md:grid-cols-[1fr_auto]"
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Receipt image</span>
            <input
              name="receiptImage"
              type="file"
              accept="image/*"
              capture="environment"
              required
              onChange={(event) => updateReceiptFile(event.target.files?.[0] ?? null)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
            />
            <span className="text-xs text-zinc-500">
              Take a photo on mobile or choose an existing image. The photo is only used for OCR.
            </span>
          </label>

          <div className="flex items-start md:pt-7">
            <button
              type="submit"
              disabled={isParsing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-5 py-2 font-medium text-white hover:bg-emerald-800 disabled:cursor-wait disabled:bg-emerald-600 md:w-auto"
            >
              {isParsing ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span>Parsing...</span>
                </>
              ) : (
                "Parse receipt"
              )}
            </button>
          </div>
        </form>

        {imageStatus ? (
          <p className="mt-3 text-sm text-zinc-500">{imageStatus}</p>
        ) : null}

        {receiptPreviewUrl && !draft ? (
          <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <img
              src={receiptPreviewUrl}
              alt="Temporary receipt preview"
              className="max-h-72 w-full rounded-md object-contain"
            />
          </div>
        ) : null}

        {parseState.error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {parseState.error}
          </div>
        ) : null}
      </section>

      {draft ? (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {receiptPreviewUrl ? (
            <aside className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <img
                src={receiptPreviewUrl}
                alt="Temporary receipt preview"
                className="max-h-[620px] w-full rounded-md object-contain"
              />
              <p className="mt-3 text-xs text-zinc-500">
                Temporary preview only. BayarLah saves the parsed items, not this photo.
              </p>
            </aside>
          ) : null}

          <section className="grid gap-6">
            <ReceiptDetails
              draft={draft}
              description={description}
              onDescriptionChange={setDescription}
              onDraftFieldChange={updateDraftField}
            />

            <SplitModePicker splitMode={splitMode} onChange={setSplitMode} />

            <ParticipantsSection
              friends={friends}
              friendSearch={friendSearch}
              inlineFriends={inlineFriends}
              searchableFriends={searchableFriends}
              selectedFriends={selectedFriends}
              onAddFriend={addSelectedFriend}
              onAddInlineFriend={addInlineFriend}
              onFriendSearchChange={setFriendSearch}
              onRemoveFriend={removeSelectedFriend}
              onRemoveInlineFriend={removeInlineFriend}
              onUpdateInlineFriend={updateInlineFriend}
            />

            <ParsedItemsSection
              assignments={assignments}
              draft={draft}
              participants={participants}
              selectedItemKey={selectedItemKey}
              splitMode={splitMode}
              onAddItem={addItem}
              onAssignSelectedItem={assignSelectedItem}
              onRemoveAssignment={removeAssignment}
              onRemoveItem={removeItem}
              onSelectItem={setSelectedItemKey}
              onUpdateItem={updateItem}
            />

            <FinalAmountsSection
              isSaving={isSaving}
              receiptPayload={receiptPayload}
              review={review}
              saveAction={saveAction}
              saveError={saveState.error}
              description={description}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ReceiptDetails({
  draft,
  description,
  onDescriptionChange,
  onDraftFieldChange,
}: {
  draft: ClientReceiptDraft;
  description: string;
  onDescriptionChange: (value: string) => void;
  onDraftFieldChange: (
    field: keyof Omit<ClientReceiptDraft, "items">,
    value: string
  ) => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-2 md:col-span-3">
          <span className="text-sm font-medium">Description</span>
          <input
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-emerald-600"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Merchant</span>
          <input
            value={draft.merchantName}
            onChange={(event) => onDraftFieldChange("merchantName", event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-emerald-600"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Date</span>
          <input
            value={draft.receiptDate}
            onChange={(event) => onDraftFieldChange("receiptDate", event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-emerald-600"
          />
        </label>

        <MoneyInput
          label="Total"
          value={draft.totalAmount}
          onChange={(value) => onDraftFieldChange("totalAmount", value)}
        />
        <MoneyInput
          label="Subtotal"
          value={draft.subtotalAmount}
          onChange={(value) => onDraftFieldChange("subtotalAmount", value)}
        />
        <MoneyInput
          label="Tax"
          value={draft.taxAmount}
          onChange={(value) => onDraftFieldChange("taxAmount", value)}
        />
        <MoneyInput
          label="Service charge"
          value={draft.serviceChargeAmount}
          onChange={(value) => onDraftFieldChange("serviceChargeAmount", value)}
        />
        <MoneyInput
          label="Rounding"
          value={draft.roundingAmount}
          onChange={(value) => onDraftFieldChange("roundingAmount", value)}
        />
      </div>
    </div>
  );
}

function SplitModePicker({
  splitMode,
  onChange,
}: {
  splitMode: SplitMode;
  onChange: (mode: SplitMode) => void;
}) {
  return (
    <fieldset className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <legend className="text-sm font-medium">Split mode</legend>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-200 p-4">
          <input
            type="radio"
            value="EQUAL_SPLIT"
            checked={splitMode === "EQUAL_SPLIT"}
            onChange={() => onChange("EQUAL_SPLIT")}
            className="mt-1"
          />
          <span>
            <span className="block font-medium">Equal split</span>
            <span className="block text-sm text-zinc-500">
              Split the final receipt total across you and selected friends.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-200 p-4">
          <input
            type="radio"
            value="CUSTOM_AMOUNT"
            checked={splitMode === "CUSTOM_AMOUNT"}
            onChange={() => onChange("CUSTOM_AMOUNT")}
            className="mt-1"
          />
          <span>
            <span className="block font-medium">Custom amounts</span>
            <span className="block text-sm text-zinc-500">
              Match each parsed item unit to the person who ordered it.
            </span>
          </span>
        </label>
      </div>
    </fieldset>
  );
}

function ParticipantsSection({
  friends,
  friendSearch,
  inlineFriends,
  searchableFriends,
  selectedFriends,
  onAddFriend,
  onAddInlineFriend,
  onFriendSearchChange,
  onRemoveFriend,
  onRemoveInlineFriend,
  onUpdateInlineFriend,
}: {
  friends: FriendOption[];
  friendSearch: string;
  inlineFriends: InlineFriendRow[];
  searchableFriends: FriendOption[];
  selectedFriends: FriendOption[];
  onAddFriend: (friendId: string) => void;
  onAddInlineFriend: () => void;
  onFriendSearchChange: (value: string) => void;
  onRemoveFriend: (friendId: string) => void;
  onRemoveInlineFriend: (key: string) => void;
  onUpdateInlineFriend: (
    key: string,
    field: keyof Omit<InlineFriendRow, "key">,
    value: string
  ) => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Participants</h2>
        <button
          type="button"
          onClick={onAddInlineFriend}
          className="rounded-md border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
        >
          + Add friend
        </button>
      </div>

      <div className="mt-4 grid gap-4">
        {friends.length > 0 ? (
          <div>
            <input
              value={friendSearch}
              onChange={(event) => onFriendSearchChange(event.target.value)}
              placeholder="Search saved friends"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-emerald-600"
            />
            <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-zinc-200 bg-white">
              {searchableFriends.length > 0 ? (
                searchableFriends.map((friend) => (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => onAddFriend(friend.id)}
                    className="flex w-full items-center justify-between gap-4 border-b border-zinc-100 px-3 py-2 text-left last:border-b-0 hover:bg-emerald-50"
                  >
                    <span>
                      <span className="block font-medium">{friend.name}</span>
                      <span className="block text-sm text-zinc-500">
                        {friend.phone}
                      </span>
                    </span>
                    <span className="text-sm font-medium text-emerald-700">Add</span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-zinc-500">
                  No saved friends found.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {selectedFriends.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {selectedFriends.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2"
              >
                <span>
                  <span className="block font-medium">{friend.name}</span>
                  <span className="block text-sm text-zinc-500">{friend.phone}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFriend(friend.id)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-3">
          {inlineFriends.map((friend, index) => {
            const active = friend.name.trim() || friend.phone.trim();

            return (
              <div
                key={friend.key}
                className="grid gap-3 rounded-md border border-zinc-100 bg-zinc-50 p-4 md:grid-cols-[1fr_1fr_auto]"
              >
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Name</span>
                  <input
                    value={friend.name}
                    required={Boolean(active)}
                    onChange={(event) =>
                      onUpdateInlineFriend(friend.key, "name", event.target.value)
                    }
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-emerald-600"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium">WhatsApp phone</span>
                  <input
                    value={friend.phone}
                    required={Boolean(active)}
                    onChange={(event) =>
                      onUpdateInlineFriend(friend.key, "phone", event.target.value)
                    }
                    placeholder="0123456789"
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-emerald-600"
                  />
                </label>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => onRemoveInlineFriend(friend.key)}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-white"
                  >
                    {inlineFriends.length === 1 && index === 0 ? "Clear" : "Remove"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ParsedItemsSection({
  assignments,
  draft,
  participants,
  selectedItemKey,
  splitMode,
  onAddItem,
  onAssignSelectedItem,
  onRemoveAssignment,
  onRemoveItem,
  onSelectItem,
  onUpdateItem,
}: {
  assignments: Assignment[];
  draft: ClientReceiptDraft;
  participants: Participant[];
  selectedItemKey: string;
  splitMode: SplitMode;
  onAddItem: () => void;
  onAssignSelectedItem: (participantKey: string) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  onRemoveItem: (itemKey: string) => void;
  onSelectItem: (itemKey: string) => void;
  onUpdateItem: (
    key: string,
    field: keyof Omit<ClientReceiptItem, "key">,
    value: string
  ) => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Parsed items</h2>
        <button
          type="button"
          onClick={onAddItem}
          className="rounded-md border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
        >
          + Add item
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        {draft.items.map((item) => (
          <div
            key={item.key}
            className="grid gap-3 rounded-md border border-zinc-200 p-4 md:grid-cols-[1fr_100px_140px_auto]"
          >
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Item</span>
              <input
                value={item.name}
                onChange={(event) =>
                  onUpdateItem(item.key, "name", event.target.value)
                }
                className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-emerald-600"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Qty</span>
              <input
                type="number"
                min="1"
                step="1"
                value={item.quantity}
                onChange={(event) =>
                  onUpdateItem(item.key, "quantity", event.target.value)
                }
                className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-emerald-600"
              />
            </label>

            <MoneyInput
              label="Unit price"
              value={item.unitAmount}
              onChange={(value) => onUpdateItem(item.key, "unitAmount", value)}
            />

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => onRemoveItem(item.key)}
                disabled={draft.items.length === 1}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {splitMode === "CUSTOM_AMOUNT" ? (
        <CustomItemMatcher
          assignments={assignments}
          items={draft.items}
          participants={participants}
          selectedItemKey={selectedItemKey}
          onAssignSelectedItem={onAssignSelectedItem}
          onRemoveAssignment={onRemoveAssignment}
          onSelectItem={onSelectItem}
        />
      ) : (
        <p className="mt-4 rounded-md bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Equal split uses the receipt total. Parsed items are saved for history.
        </p>
      )}
    </div>
  );
}

function CustomItemMatcher({
  assignments,
  items,
  participants,
  selectedItemKey,
  onAssignSelectedItem,
  onRemoveAssignment,
  onSelectItem,
}: {
  assignments: Assignment[];
  items: ClientReceiptItem[];
  participants: Participant[];
  selectedItemKey: string;
  onAssignSelectedItem: (participantKey: string) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  onSelectItem: (itemKey: string) => void;
}) {
  const itemByKey = new Map(items.map((item) => [item.key, item]));

  return (
    <div className="mt-5 grid gap-5">
      <div>
        <h3 className="text-sm font-medium">Unassigned items</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {items.map((item) => {
            const remaining = getRemainingQuantity(item, assignments);
            if (remaining <= 0) return null;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelectItem(item.key)}
                className={`rounded-md border px-3 py-2 text-left text-sm ${
                  selectedItemKey === item.key
                    ? "border-emerald-600 bg-emerald-50"
                    : "border-zinc-200 bg-zinc-50 hover:bg-emerald-50"
                }`}
              >
                <span className="block font-medium">
                  {item.name || "Item"} x{remaining}
                </span>
                <span className="text-zinc-500">
                  {formatMoney((parseMoneyToCents(item.unitAmount) ?? 0) / 100)} each
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium">Tap a participant to assign</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {participants.map((participant) => {
            const participantAssignments = assignments.filter(
              (assignment) => assignment.participantKey === participant.key
            );
            const subtotalCents = participantAssignments.reduce((sum, assignment) => {
              const item = itemByKey.get(assignment.itemKey);
              return sum + (parseMoneyToCents(item?.unitAmount ?? "") ?? 0);
            }, 0);

            return (
              <div
                key={participant.key}
                className="rounded-md border border-zinc-200 p-4"
              >
                <button
                  type="button"
                  onClick={() => onAssignSelectedItem(participant.key)}
                  disabled={!selectedItemKey}
                  className="flex w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>
                    <span className="block font-medium">{participant.name}</span>
                    {participant.phone ? (
                      <span className="block text-sm text-zinc-500">
                        {participant.phone}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm font-medium text-emerald-700">
                    {formatMoney(subtotalCents / 100)}
                  </span>
                </button>

                {participantAssignments.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {participantAssignments.map((assignment) => {
                      const item = itemByKey.get(assignment.itemKey);

                      return (
                        <div
                          key={assignment.id}
                          className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 px-3 py-2 text-sm"
                        >
                          <span>
                            {item?.name || "Item"} -{" "}
                            {formatMoney(
                              (parseMoneyToCents(item?.unitAmount ?? "") ?? 0) / 100
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => onRemoveAssignment(assignment.id)}
                            className="text-xs font-medium text-zinc-600 hover:text-zinc-950"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FinalAmountsSection({
  isSaving,
  receiptPayload,
  review,
  saveAction,
  saveError,
  description,
}: {
  isSaving: boolean;
  receiptPayload: string;
  review: ReturnType<typeof buildReview> | null;
  saveAction: (payload: FormData) => void;
  saveError?: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Final amounts</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Tax, service charge, and rounding are allocated proportionally in custom mode.
          </p>
        </div>
        <span className="text-sm font-medium text-zinc-600">
          Receipt total {formatMoney((review?.totalCents ?? 0) / 100)}
        </span>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {review?.participantSummaries.map((participant) => (
          <div
            key={participant.key}
            className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 text-sm"
          >
            <span>{participant.name}</span>
            <span className="font-medium">{formatMoney(participant.totalCents / 100)}</span>
          </div>
        ))}
      </div>

      {review && review.errors.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ul className="list-inside list-disc">
            {review.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {saveError ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      ) : null}

      <form action={saveAction} className="mt-5 grid gap-5">
        <input type="hidden" name="description" value={description} />
        <input type="hidden" name="receiptPayload" value={receiptPayload} />
        <ReminderFrequencyPicker />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!review?.canSave || isSaving}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-5 py-2 font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isSaving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span>Saving...</span>
              </>
            ) : (
              "Save receipt expense"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function MoneyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-emerald-600"
      />
    </label>
  );
}

function buildReview({
  draft,
  splitMode,
  participants,
  assignments,
  description,
  hasIncompleteInlineFriend,
}: {
  draft: ClientReceiptDraft;
  splitMode: SplitMode;
  participants: Participant[];
  assignments: Assignment[];
  description: string;
  hasIncompleteInlineFriend: boolean;
}) {
  const errors: string[] = [];
  const subtotalCents = parseMoneyToCents(draft.subtotalAmount) ?? 0;
  const taxCents = parseMoneyToCents(draft.taxAmount) ?? 0;
  const serviceChargeCents = parseMoneyToCents(draft.serviceChargeAmount) ?? 0;
  const roundingCents = parseMoneyToCents(draft.roundingAmount) ?? 0;
  const totalCents = parseMoneyToCents(draft.totalAmount) ?? 0;
  const itemSubtotalCents = getItemSubtotalCents(draft.items, errors);
  const finalTotals = new Map<string, number>();

  if (!description.trim()) errors.push("Add a description.");
  if (hasIncompleteInlineFriend) errors.push("Complete each inline friend.");
  if (participants.length === 1) errors.push("Add at least one friend.");
  if (subtotalCents <= 0 || totalCents <= 0) {
    errors.push("Receipt subtotal and total must be above RM0.00.");
  }
  if (taxCents < 0 || serviceChargeCents < 0) {
    errors.push("Tax and service charge cannot be negative.");
  }
  if (itemSubtotalCents !== subtotalCents) {
    errors.push("Item prices must match the receipt subtotal.");
  }
  if (subtotalCents + taxCents + serviceChargeCents + roundingCents !== totalCents) {
    errors.push("Subtotal, tax, service, and rounding must match total.");
  }

  if (splitMode === "EQUAL_SPLIT") {
    const equalTotals = distributeEvenly(
      totalCents,
      participants.map((participant) => participant.key)
    );
    for (const participant of participants) {
      finalTotals.set(participant.key, equalTotals.get(participant.key) ?? 0);
    }
  } else {
    const participantSubtotals = new Map<string, number>();
    for (const participant of participants) {
      participantSubtotals.set(participant.key, 0);
    }

    for (const item of draft.items) {
      const quantity = parseQuantity(item.quantity) ?? 0;
      const remaining = getRemainingQuantity(item, assignments);
      const unitCents = parseMoneyToCents(item.unitAmount) ?? 0;

      if (remaining > 0) {
        errors.push(`Assign all ${item.name || "item"} units.`);
      }

      if (assignments.filter((assignment) => assignment.itemKey === item.key).length > quantity) {
        errors.push(`Too many assignments for ${item.name || "item"}.`);
      }

      for (const assignment of assignments.filter(
        (current) => current.itemKey === item.key
      )) {
        participantSubtotals.set(
          assignment.participantKey,
          (participantSubtotals.get(assignment.participantKey) ?? 0) + unitCents
        );
      }
    }

    const chargesCents = taxCents + serviceChargeCents + roundingCents;
    const proportionalBases: ProportionalBase[] = Array.from(
      participantSubtotals.entries()
    ).map(([key, baseCents]) => ({ key, baseCents }));
    const adjustmentAllocations = distributeProportionally(
      chargesCents,
      proportionalBases
    );

    for (const [key, subtotal] of participantSubtotals.entries()) {
      const finalTotal = subtotal + (adjustmentAllocations.get(key) ?? 0);
      finalTotals.set(key, finalTotal);

      if (finalTotal < 0) errors.push("A participant total is below RM0.00.");
    }

    const computedFinalTotal = Array.from(finalTotals.values()).reduce(
      (sum, cents) => sum + cents,
      0
    );
    if (computedFinalTotal !== totalCents) {
      errors.push("Final participant amounts must match the receipt total.");
    }
  }

  const friendHasAmount = participants.some(
    (participant) =>
      participant.type !== "COLLECTOR" && (finalTotals.get(participant.key) ?? 0) > 0
  );
  if (!friendHasAmount) errors.push("Assign at least one amount to a friend.");

  return {
    canSave: errors.length === 0,
    errors: Array.from(new Set(errors)),
    participantSummaries: participants.map((participant) => ({
      key: participant.key,
      name: participant.name,
      totalCents: finalTotals.get(participant.key) ?? 0,
    })),
    totalCents,
  };
}

function buildReceiptPayload(
  draft: ClientReceiptDraft,
  splitMode: SplitMode,
  participants: Participant[],
  assignments: Assignment[]
) {
  return {
    splitMode,
    merchantName: draft.merchantName,
    receiptDate: draft.receiptDate,
    subtotalCents: parseMoneyToCents(draft.subtotalAmount) ?? 0,
    taxCents: parseMoneyToCents(draft.taxAmount) ?? 0,
    serviceChargeCents: parseMoneyToCents(draft.serviceChargeAmount) ?? 0,
    roundingCents: parseMoneyToCents(draft.roundingAmount) ?? 0,
    totalCents: parseMoneyToCents(draft.totalAmount) ?? 0,
    participants: participants.map((participant) => ({
      key: participant.key,
      participantType: participant.type,
      friendId: participant.friendId,
      inlineFriendName:
        participant.type === "INLINE_FRIEND" ? participant.name : undefined,
      inlineFriendPhone:
        participant.type === "INLINE_FRIEND" ? participant.phone : undefined,
    })),
    items: draft.items.map((item) => {
      const quantity = parseQuantity(item.quantity) ?? 0;
      const unitAmountCents = parseMoneyToCents(item.unitAmount) ?? 0;

      return {
        key: item.key,
        name: item.name,
        quantity,
        unitAmountCents,
        totalAmountCents: quantity * unitAmountCents,
        assignments:
          splitMode === "CUSTOM_AMOUNT"
            ? assignments
                .filter((assignment) => assignment.itemKey === item.key)
                .map((assignment) => ({
                  participantKey: assignment.participantKey,
                }))
            : [],
      };
    }),
  };
}

function toClientDraft(draft: ParsedReceiptDraft): ClientReceiptDraft {
  return {
    merchantName: draft.merchantName,
    receiptDate: draft.receiptDate,
    subtotalAmount: centsToMoneyString(draft.subtotalCents),
    taxAmount: centsToMoneyString(draft.taxCents),
    serviceChargeAmount: centsToMoneyString(draft.serviceChargeCents),
    roundingAmount: centsToMoneyString(draft.roundingCents),
    totalAmount: centsToMoneyString(draft.totalCents),
    items: draft.items.map((item, index) => ({
      key: `item-${index + 1}`,
      name: item.name,
      quantity: String(item.quantity),
      unitAmount: centsToMoneyString(item.unitAmountCents),
    })),
  };
}

function getItemSubtotalCents(items: ClientReceiptItem[], errors: string[]) {
  return items.reduce((sum, item) => {
    const quantity = parseQuantity(item.quantity);
    const unitAmountCents = parseMoneyToCents(item.unitAmount);

    if (!item.name.trim()) errors.push("Each item needs a name.");
    if (!quantity || quantity <= 0) {
      errors.push(`"${item.name || "Item"}" needs a valid quantity.`);
      return sum;
    }
    if (!unitAmountCents || unitAmountCents <= 0) {
      errors.push(`"${item.name || "Item"}" needs a valid unit price.`);
      return sum;
    }

    return sum + quantity * unitAmountCents;
  }, 0);
}

function getRemainingQuantity(item: ClientReceiptItem, assignments: Assignment[]) {
  const quantity = parseQuantity(item.quantity) ?? 0;
  const assignedCount = assignments.filter(
    (assignment) => assignment.itemKey === item.key
  ).length;

  return Math.max(0, quantity - assignedCount);
}

function trimAssignmentsForItem(
  assignments: Assignment[],
  itemKey: string,
  quantity: number
) {
  let kept = 0;

  return assignments.filter((assignment) => {
    if (assignment.itemKey !== itemKey) return true;
    kept += 1;
    return kept <= quantity;
  });
}

function createInlineFriendRow(number: number): InlineFriendRow {
  return {
    key: `inline-${number}`,
    name: "",
    phone: "",
  };
}

function getNextInlineFriendNumber(friends: InlineFriendRow[]) {
  const highest = friends.reduce((max, friend) => {
    const number = Number(friend.key.replace("inline-", ""));
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);

  return highest + 1;
}

function getNextItemNumber(items: ClientReceiptItem[]) {
  const highest = items.reduce((max, item) => {
    const number = Number(item.key.replace("item-", ""));
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);

  return highest + 1;
}

function parseQuantity(value: string) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return null;
  return Math.max(0, Math.round(quantity));
}

async function compressReceiptImage(file: File) {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= TARGET_RECEIPT_BYTES) return file;

  const image = await loadImage(file);
  const scale = Math.min(
    1,
    MAX_RECEIPT_DIMENSION / Math.max(image.width, image.height)
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext("2d");
  if (!context) return file;

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.82, 0.72, 0.62, 0.52]) {
    const blob = await canvasToBlob(canvas, quality);
    if (!blob) continue;

    if (blob.size <= TARGET_RECEIPT_BYTES || quality === 0.52) {
      return new File([blob], replaceImageExtension(file.name), {
        type: "image/jpeg",
      });
    }
  }

  return file;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not prepare this image for OCR."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

function replaceImageExtension(name: string) {
  const baseName = name.replace(/\.[^.]+$/, "") || "receipt";
  return `${baseName}.jpg`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getClientErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
