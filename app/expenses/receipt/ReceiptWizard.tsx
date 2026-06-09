"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import ReminderFrequencyPicker from "@/components/ReminderFrequencyPicker";
import ImageLightbox from "@/components/ImageLightbox";
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

type MobileStep = "DETAILS" | "PEOPLE" | "ITEMS" | "REVIEW";

const initialParseState: ReceiptParseState = {};
const initialSaveState: ReceiptSaveState = {};
const TARGET_RECEIPT_BYTES = 2.5 * 1024 * 1024;
const MAX_RECEIPT_DIMENSION = 1600;
const MOBILE_STEPS: { key: MobileStep; label: string }[] = [
  { key: "DETAILS", label: "Details" },
  { key: "PEOPLE", label: "People" },
  { key: "ITEMS", label: "Items" },
  { key: "REVIEW", label: "Review" },
];

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
  const [receiptInputVersion, setReceiptInputVersion] = useState(0);
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
  const nextAssignmentNumber = useRef(1);
  const [mobileStep, setMobileStep] = useState<MobileStep>("DETAILS");
  const [mobileValidationStep, setMobileValidationStep] =
    useState<MobileStep | null>(null);
  const [mobileEditingItemKey, setMobileEditingItemKey] = useState("");
  const [showNeedsAssignmentOnly, setShowNeedsAssignmentOnly] = useState(false);
  const mobileFlowRef = useRef<HTMLDivElement>(null);

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
    nextAssignmentNumber.current = 1;
    setMobileStep("DETAILS");
    setMobileValidationStep(null);
    setMobileEditingItemKey("");
    setShowNeedsAssignmentOnly(false);
  }, [parseState.draft]);

  useEffect(() => {
    return () => {
      if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    };
  }, [receiptPreviewUrl]);

  useEffect(() => {
    if (!mobileEditingItemKey) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileEditingItemKey("");
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileEditingItemKey]);

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
  const mobileStepErrors = useMemo(
    () =>
      review
        ? review.errors.filter(
            (error) => getMobileErrorStep(error, splitMode) === mobileStep
          )
        : [],
    [mobileStep, review, splitMode]
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
            items: [...current.items, createClientReceiptItem(current.items)],
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

    assignItem(selectedItemKey, participantKey);

    if (getRemainingQuantity(item, assignments) <= 1) {
      setSelectedItemKey("");
    }
  }

  function assignItem(itemKey: string, participantKey: string) {
    if (!draft) return;

    const item = draft.items.find((current) => current.key === itemKey);
    if (!item) return;

    const assignmentId = `assignment-${nextAssignmentNumber.current}`;
    nextAssignmentNumber.current += 1;
    setAssignments((current) =>
      getRemainingQuantity(item, current) <= 0
        ? current
        : [...current, { id: assignmentId, itemKey, participantKey }]
    );
  }

  function removeAssignment(assignmentId: string) {
    setAssignments((current) =>
      current.filter((assignment) => assignment.id !== assignmentId)
    );
  }

  function updateReceiptFile(file: File | null) {
    if (!file) setReceiptInputVersion((current) => current + 1);
    setReceiptFile(file);
    setDraft(null);
    setParseState(initialParseState);
    setImageStatus("");
    setMobileEditingItemKey("");
    setMobileValidationStep(null);
    setReceiptPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : "";
    });
  }

  function goToMobileStep(step: MobileStep, showValidation = false) {
    setMobileStep(step);
    setMobileValidationStep(showValidation ? step : null);
    setMobileEditingItemKey("");
    requestAnimationFrame(() => {
      mobileFlowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function continueMobileFlow() {
    if (mobileStepErrors.length > 0) {
      setMobileValidationStep(mobileStep);
      requestAnimationFrame(() => {
        mobileFlowRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
      return;
    }

    const currentIndex = MOBILE_STEPS.findIndex((step) => step.key === mobileStep);
    const nextStep = MOBILE_STEPS[currentIndex + 1];
    if (nextStep) goToMobileStep(nextStep.key);
  }

  function goBackMobileFlow() {
    const currentIndex = MOBILE_STEPS.findIndex((step) => step.key === mobileStep);
    const previousStep = MOBILE_STEPS[currentIndex - 1];
    if (previousStep) goToMobileStep(previousStep.key);
  }

  function addAndEditMobileItem() {
    if (!draft) return;

    const item = createClientReceiptItem(draft.items);
    setDraft({ ...draft, items: [...draft.items, item] });
    setMobileEditingItemKey(item.key);
  }

  function removeMobileItem(key: string) {
    removeItem(key);
    setMobileEditingItemKey("");
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
    <div className={`grid gap-6 ${draft ? "pb-24 md:pb-0" : ""}`}>
      <ReceiptUploadSection
        key={`receipt-upload-${receiptInputVersion}`}
        className={draft ? "hidden md:block" : ""}
        draft={draft}
        imageStatus={imageStatus}
        isParsing={isParsing}
        parseError={parseState.error}
        receiptPreviewUrl={receiptPreviewUrl}
        onFileChange={updateReceiptFile}
        onSubmit={handleReceiptSubmit}
      />

      {draft ? (
        <>
          <MobileReceiptSummary
            draft={draft}
            receiptFile={receiptFile}
            receiptPreviewUrl={receiptPreviewUrl}
            onChangeReceipt={() => updateReceiptFile(null)}
          />

          <div className="hidden min-w-0 gap-6 md:grid lg:grid-cols-[300px_minmax(0,1fr)]">
            {receiptPreviewUrl ? (
              <aside className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
                <ImageLightbox
                  src={receiptPreviewUrl}
                  alt="Temporary receipt preview"
                  className="max-h-[620px] w-full rounded-md object-contain"
                />
                <p className="mt-3 text-xs text-zinc-500">
                  Temporary preview only. BayarLah saves the parsed items, not this photo.
                </p>
              </aside>
            ) : null}

            <section className="grid min-w-0 gap-6">
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

          <div ref={mobileFlowRef} className="grid scroll-mt-4 gap-4 md:hidden">
            <MobileStepIndicator
              currentStep={mobileStep}
              onSelectStep={(step) => goToMobileStep(step)}
            />

            {mobileValidationStep === mobileStep &&
            mobileStepErrors.length > 0 ? (
              <MobileValidationAlert errors={mobileStepErrors} />
            ) : null}

            {mobileStep === "DETAILS" ? (
              <ReceiptDetails
                draft={draft}
                description={description}
                onDescriptionChange={setDescription}
                onDraftFieldChange={updateDraftField}
              />
            ) : null}

            {mobileStep === "PEOPLE" ? (
              <>
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
              </>
            ) : null}

            {mobileStep === "ITEMS" ? (
              <MobileParsedItemsSection
                assignments={assignments}
                draft={draft}
                showNeedsAssignmentOnly={showNeedsAssignmentOnly}
                splitMode={splitMode}
                onAddItem={addAndEditMobileItem}
                onEditItem={setMobileEditingItemKey}
                onToggleNeedsAssignment={() =>
                  setShowNeedsAssignmentOnly((current) => !current)
                }
              />
            ) : null}

            <div className={mobileStep === "REVIEW" ? "" : "hidden"}>
              <FinalAmountsSection
                description={description}
                formId="mobile-receipt-save-form"
                isSaving={isSaving}
                receiptPayload={receiptPayload}
                review={review}
                saveAction={saveAction}
                saveError={saveState.error}
                submitPlacement="external"
                onErrorSelect={(error) =>
                  goToMobileStep(getMobileErrorStep(error, splitMode), true)
                }
              />
            </div>
          </div>

          {mobileEditingItemKey ? (
            <MobileItemEditorSheet
              assignments={assignments}
              item={
                draft.items.find((item) => item.key === mobileEditingItemKey) ??
                null
              }
              items={draft.items}
              participants={participants}
              splitMode={splitMode}
              onAssignItem={assignItem}
              onClose={() => setMobileEditingItemKey("")}
              onEditItem={setMobileEditingItemKey}
              onRemoveAssignment={removeAssignment}
              onRemoveItem={removeMobileItem}
              onUpdateItem={updateItem}
            />
          ) : null}

          <MobileStickyNavigation
            canSave={Boolean(review?.canSave)}
            currentStep={mobileStep}
            formId="mobile-receipt-save-form"
            isSaving={isSaving}
            onBack={goBackMobileFlow}
            onContinue={continueMobileFlow}
          />
        </>
      ) : null}
    </div>
  );
}

function ReceiptUploadSection({
  className = "",
  draft,
  imageStatus,
  isParsing,
  parseError,
  receiptPreviewUrl,
  onFileChange,
  onSubmit,
}: {
  className?: string;
  draft: ClientReceiptDraft | null;
  imageStatus: string;
  isParsing: boolean;
  parseError?: string;
  receiptPreviewUrl: string;
  onFileChange: (file: File | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section
      className={`rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6 ${className}`}
    >
      <form
        onSubmit={onSubmit}
        className="grid gap-4 md:grid-cols-[1fr_auto]"
      >
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Receipt image</span>
          <input
            name="receiptImage"
            type="file"
            accept="image/*"
            required
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            className="h-10 rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-sm outline-none focus:border-2 focus:border-[#1d4ed8]"
          />
          <span className="text-xs text-zinc-500">
            Take a photo on mobile or choose an existing image. The photo is only
            used for OCR.
          </span>
        </label>

        <div className="flex items-start md:pt-7">
          <button
            type="submit"
            disabled={isParsing}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0a0a0a] px-6 py-[11px] text-sm font-semibold text-white hover:bg-[#222222] disabled:cursor-wait disabled:bg-[#e5e7eb] disabled:text-[#a8aab2] md:w-auto"
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
        <div className="mt-4 rounded-lg border border-[#e5e7eb] bg-[#f7f8fa] p-3">
          <ImageLightbox
            src={receiptPreviewUrl}
            alt="Temporary receipt preview"
            className="max-h-72 w-full rounded-md object-contain"
          />
        </div>
      ) : null}

      {parseError ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {parseError}
        </div>
      ) : null}
    </section>
  );
}

function MobileReceiptSummary({
  draft,
  receiptFile,
  receiptPreviewUrl,
  onChangeReceipt,
}: {
  draft: ClientReceiptDraft;
  receiptFile: File | null;
  receiptPreviewUrl: string;
  onChangeReceipt: () => void;
}) {
  return (
    <section className="flex min-w-0 items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white p-3 shadow-sm md:hidden">
      {receiptPreviewUrl ? (
        <ImageLightbox
          src={receiptPreviewUrl}
          alt="Receipt preview"
          className="h-14 w-14 shrink-0 rounded-lg border border-[#e5e7eb] object-cover"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {draft.merchantName || receiptFile?.name || "Parsed receipt"}
        </p>
        <p className="text-xs text-zinc-500">
          {draft.items.length} {draft.items.length === 1 ? "item" : "items"} parsed
        </p>
      </div>
      <button
        type="button"
        onClick={onChangeReceipt}
        className="shrink-0 rounded-full border border-[#0a0a0a] bg-white px-4 py-2 text-xs font-semibold text-[#0a0a0a]"
      >
        Change receipt
      </button>
    </section>
  );
}

function MobileStepIndicator({
  currentStep,
  onSelectStep,
}: {
  currentStep: MobileStep;
  onSelectStep: (step: MobileStep) => void;
}) {
  return (
    <nav
      aria-label="Receipt steps"
      className="rounded-xl border border-[#e5e7eb] bg-white p-2 shadow-sm"
    >
      <ol className="grid grid-cols-4 gap-1">
        {MOBILE_STEPS.map((step, index) => {
          const active = step.key === currentStep;

          return (
            <li key={step.key}>
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => onSelectStep(step.key)}
                className={`flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-xs font-medium ${
                  active
                    ? "bg-[#0a0a0a] text-white"
                    : "text-zinc-500 hover:bg-[#f7f8fa] hover:text-zinc-950"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                    active ? "bg-white text-[#0a0a0a]" : "bg-[#f2f3f5]"
                  }`}
                >
                  {index + 1}
                </span>
                <span>{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function MobileValidationAlert({ errors }: { errors: string[] }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <p className="font-medium">Complete this step to continue:</p>
      <ul className="mt-1 list-inside list-disc">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}

function MobileParsedItemsSection({
  assignments,
  draft,
  showNeedsAssignmentOnly,
  splitMode,
  onAddItem,
  onEditItem,
  onToggleNeedsAssignment,
}: {
  assignments: Assignment[];
  draft: ClientReceiptDraft;
  showNeedsAssignmentOnly: boolean;
  splitMode: SplitMode;
  onAddItem: () => void;
  onEditItem: (itemKey: string) => void;
  onToggleNeedsAssignment: () => void;
}) {
  const totalUnits = draft.items.reduce(
    (sum, item) => sum + (parseQuantity(item.quantity) ?? 0),
    0
  );
  const assignedUnits = assignments.filter((assignment) =>
    draft.items.some((item) => item.key === assignment.itemKey)
  ).length;
  const visibleItems =
    splitMode === "CUSTOM_AMOUNT" && showNeedsAssignmentOnly
      ? draft.items.filter(
          (item) => getRemainingQuantity(item, assignments) > 0
        )
      : draft.items;

  return (
    <section className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Parsed items</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Tap an item to edit it
            {splitMode === "CUSTOM_AMOUNT" ? " or assign its units" : ""}.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddItem}
          className="shrink-0 rounded-full border border-[#0a0a0a] bg-white px-4 py-2 text-xs font-semibold text-[#0a0a0a]"
        >
          + Add
        </button>
      </div>

      {splitMode === "CUSTOM_AMOUNT" ? (
        <div className="mt-4 rounded-lg bg-[#f7f8fa] p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">Assignment progress</span>
            <span className="text-zinc-600">
              {Math.min(assignedUnits, totalUnits)} of {totalUnits} units
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e5e7eb]">
            <div
              className="h-full rounded-full bg-[#1d4ed8]"
              style={{
                width: `${
                  totalUnits > 0
                    ? Math.min(100, (assignedUnits / totalUnits) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
          <button
            type="button"
            aria-pressed={showNeedsAssignmentOnly}
            onClick={onToggleNeedsAssignment}
            className={`mt-3 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              showNeedsAssignmentOnly
                ? "border-[#1d4ed8] bg-white text-[#1d4ed8]"
                : "border-[#e5e7eb] bg-white text-zinc-600"
            }`}
          >
            Needs assignment
          </button>
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-[#f7f8fa] px-3 py-2 text-sm text-zinc-600">
          Equal split uses the receipt total. Items are kept for receipt history.
        </p>
      )}

      <div className="mt-4 grid gap-2">
        {visibleItems.map((item) => {
          const quantity = parseQuantity(item.quantity) ?? 0;
          const assigned = assignments.filter(
            (assignment) => assignment.itemKey === item.key
          ).length;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onEditItem(item.key)}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border border-[#e5e7eb] bg-[#f7f8fa] px-3 py-3 text-left hover:bg-white"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {item.name || "Unnamed item"}
                </span>
                <span className="mt-1 block text-xs text-zinc-500">
                  Qty {item.quantity || "0"} -{" "}
                  {formatMoney((parseMoneyToCents(item.unitAmount) ?? 0) / 100)}{" "}
                  each
                </span>
                {splitMode === "CUSTOM_AMOUNT" ? (
                  <span
                    className={`mt-1 block text-xs font-medium ${
                      assigned >= quantity && quantity > 0
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }`}
                  >
                    {assigned} of {quantity} assigned
                  </span>
                ) : null}
              </span>
              <span className="self-center text-sm font-medium text-[#1d4ed8]">
                Edit
              </span>
            </button>
          );
        })}

        {visibleItems.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#e5e7eb] px-3 py-6 text-center text-sm text-zinc-500">
            All item units are assigned.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function MobileItemEditorSheet({
  assignments,
  item,
  items,
  participants,
  splitMode,
  onAssignItem,
  onClose,
  onEditItem,
  onRemoveAssignment,
  onRemoveItem,
  onUpdateItem,
}: {
  assignments: Assignment[];
  item: ClientReceiptItem | null;
  items: ClientReceiptItem[];
  participants: Participant[];
  splitMode: SplitMode;
  onAssignItem: (itemKey: string, participantKey: string) => void;
  onClose: () => void;
  onEditItem: (itemKey: string) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  onRemoveItem: (itemKey: string) => void;
  onUpdateItem: (
    key: string,
    field: keyof Omit<ClientReceiptItem, "key">,
    value: string
  ) => void;
}) {
  if (!item) return null;

  const quantity = parseQuantity(item.quantity) ?? 0;
  const itemAssignments = assignments.filter(
    (assignment) => assignment.itemKey === item.key
  );
  const remaining = getRemainingQuantity(item, assignments);
  const nextItem = getNextUnassignedItem(items, item.key, assignments);

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <button
        type="button"
        aria-label="Close item editor"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-item-editor-title"
        className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-zinc-300" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="mobile-item-editor-title" className="text-xl font-semibold">
              Edit item
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {splitMode === "CUSTOM_AMOUNT"
                ? `${itemAssignments.length} of ${quantity} units assigned`
                : "Update the parsed receipt item."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#e5e7eb] px-4 py-2 text-sm font-semibold"
          >
            Done
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Item</span>
            <input
              value={item.name}
              onChange={(event) =>
                onUpdateItem(item.key, "name", event.target.value)
              }
              placeholder="Chicken rice"
              className="h-11 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
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
                className="h-11 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none focus:border-2 focus:border-[#1d4ed8]"
              />
            </label>
            <MoneyInput
              label="Unit price"
              value={item.unitAmount}
              placeholder="12.50"
              onChange={(value) => onUpdateItem(item.key, "unitAmount", value)}
            />
          </div>
        </div>

        {splitMode === "CUSTOM_AMOUNT" ? (
          <div className="mt-6 border-t border-[#e5e7eb] pt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Assign units</h3>
              <span
                className={`text-sm font-medium ${
                  remaining > 0 ? "text-amber-700" : "text-emerald-700"
                }`}
              >
                {remaining} remaining
              </span>
            </div>

            <div className="mt-3 grid gap-2">
              {participants.map((participant) => {
                const participantAssignments = itemAssignments.filter(
                  (assignment) =>
                    assignment.participantKey === participant.key
                );
                const lastAssignment =
                  participantAssignments[participantAssignments.length - 1];

                return (
                  <div
                    key={participant.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[#e5e7eb] bg-[#f7f8fa] px-3 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {participant.name}
                      </span>
                      <span className="block text-xs text-zinc-500">
                        {participantAssignments.length} assigned
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {lastAssignment ? (
                        <button
                          type="button"
                          aria-label={`Remove one ${item.name || "item"} unit from ${participant.name}`}
                          onClick={() =>
                            onRemoveAssignment(lastAssignment.id)
                          }
                          className="h-9 w-9 rounded-full border border-[#e5e7eb] bg-white text-lg font-medium"
                        >
                          -
                        </button>
                      ) : null}
                      <button
                        type="button"
                        aria-label={`Assign one ${item.name || "item"} unit to ${participant.name}`}
                        disabled={remaining <= 0}
                        onClick={() => onAssignItem(item.key, participant.key)}
                        className="h-9 w-9 rounded-full bg-[#0a0a0a] text-lg font-medium text-white disabled:bg-[#e5e7eb] disabled:text-[#a8aab2]"
                      >
                        +
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              disabled={!nextItem}
              onClick={() => {
                if (nextItem) onEditItem(nextItem.key);
              }}
              className="mt-4 w-full rounded-full border border-[#0a0a0a] bg-white px-5 py-[11px] text-sm font-semibold disabled:border-[#e5e7eb] disabled:text-[#a8aab2]"
            >
              {nextItem ? "Next unassigned item" : "All items assigned"}
            </button>
          </div>
        ) : null}

        <button
          type="button"
          disabled={items.length === 1}
          onClick={() => onRemoveItem(item.key)}
          className="mt-5 w-full rounded-full border border-red-200 bg-white px-5 py-[11px] text-sm font-semibold text-red-700 disabled:border-[#e5e7eb] disabled:text-[#a8aab2]"
        >
          Remove item
        </button>
      </section>
    </div>
  );
}

function MobileStickyNavigation({
  canSave,
  currentStep,
  formId,
  isSaving,
  onBack,
  onContinue,
}: {
  canSave: boolean;
  currentStep: MobileStep;
  formId: string;
  isSaving: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const isFirstStep = currentStep === MOBILE_STEPS[0].key;
  const isReview = currentStep === "REVIEW";

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e5e7eb] bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-5xl gap-3">
        <button
          type="button"
          disabled={isFirstStep}
          onClick={onBack}
          className="rounded-full border border-[#0a0a0a] bg-white px-5 py-[11px] text-sm font-semibold disabled:border-[#e5e7eb] disabled:text-[#a8aab2]"
        >
          Back
        </button>
        {isReview ? (
          <button
            type="submit"
            form={formId}
            disabled={!canSave || isSaving}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#0a0a0a] px-6 py-[11px] text-sm font-semibold text-white disabled:bg-[#e5e7eb] disabled:text-[#a8aab2]"
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
        ) : (
          <button
            type="button"
            onClick={onContinue}
            className="flex-1 rounded-full bg-[#0a0a0a] px-6 py-[11px] text-sm font-semibold text-white"
          >
            Continue
          </button>
        )}
      </div>
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
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-2 md:col-span-3">
          <span className="text-sm font-medium">Description</span>
          <input
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Team lunch at Nasi Kandar"
            className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Merchant</span>
          <input
            value={draft.merchantName}
            onChange={(event) => onDraftFieldChange("merchantName", event.target.value)}
            placeholder="Restoran Maju"
            className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Date</span>
          <input
            value={draft.receiptDate}
            onChange={(event) => onDraftFieldChange("receiptDate", event.target.value)}
            placeholder="2026-06-07"
            className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
          />
        </label>

        <MoneyInput
          label="Total"
          value={draft.totalAmount}
          placeholder="65.00"
          onChange={(value) => onDraftFieldChange("totalAmount", value)}
        />
        <MoneyInput
          label="Subtotal"
          value={draft.subtotalAmount}
          placeholder="60.00"
          onChange={(value) => onDraftFieldChange("subtotalAmount", value)}
        />
        <MoneyInput
          label="Tax"
          value={draft.taxAmount}
          placeholder="3.60"
          onChange={(value) => onDraftFieldChange("taxAmount", value)}
        />
        <MoneyInput
          label="Service charge"
          value={draft.serviceChargeAmount}
          placeholder="1.40"
          onChange={(value) => onDraftFieldChange("serviceChargeAmount", value)}
        />
        <MoneyInput
          label="Rounding"
          value={draft.roundingAmount}
          placeholder="0.00"
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
    <fieldset className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6">
      <legend className="text-sm font-medium">Split mode</legend>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#e5e7eb] bg-[#f7f8fa] p-4">
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

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#e5e7eb] bg-[#f7f8fa] p-4">
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
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Participants</h2>
        <button
          type="button"
          onClick={onAddInlineFriend}
          className="w-full rounded-full border border-[#0a0a0a] bg-white px-6 py-[11px] text-sm font-semibold text-[#0a0a0a] hover:bg-[#f7f8fa] sm:w-auto"
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
              className="h-10 w-full rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
            />
              <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-[#e5e7eb] bg-white">
              {searchableFriends.length > 0 ? (
                searchableFriends.map((friend) => (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => onAddFriend(friend.id)}
                    className="flex min-w-0 w-full items-center justify-between gap-4 border-b border-[#eaecf0] px-3 py-2 text-left last:border-b-0 hover:bg-[#f7f8fa]"
                  >
                    <span className="min-w-0">
                      <span className="block break-words font-medium">{friend.name}</span>
                      <span className="block break-all text-sm text-zinc-500">
                        {friend.phone}
                      </span>
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
        ) : null}

        {selectedFriends.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {selectedFriends.map((friend) => (
              <div
                key={friend.id}
                className="flex flex-col gap-3 rounded-lg border border-[#e5e7eb] bg-[#f7f8fa] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2"
              >
                <span className="min-w-0">
                  <span className="block break-words font-medium">{friend.name}</span>
                  <span className="block break-all text-sm text-zinc-500">
                    {friend.phone}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFriend(friend.id)}
                  className="w-full rounded-full border border-[#0a0a0a] bg-white px-6 py-[11px] text-sm font-semibold text-[#0a0a0a] hover:bg-white sm:w-auto"
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
                className="grid gap-3 rounded-lg border border-[#e5e7eb] bg-[#f7f8fa] p-4 md:grid-cols-[1fr_1fr_auto]"
              >
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Name</span>
                  <input
                    value={friend.name}
                    required={Boolean(active)}
                    onChange={(event) =>
                      onUpdateInlineFriend(friend.key, "name", event.target.value)
                    }
                    placeholder="Nur Aisyah"
                    className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
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
                    className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
                  />
                </label>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => onRemoveInlineFriend(friend.key)}
                    className="w-full rounded-full border border-[#0a0a0a] bg-white px-6 py-[11px] text-sm font-semibold text-[#0a0a0a] hover:bg-white sm:w-auto"
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
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Parsed items</h2>
        <button
          type="button"
          onClick={onAddItem}
          className="w-full rounded-full border border-[#0a0a0a] bg-white px-6 py-[11px] text-sm font-semibold text-[#0a0a0a] hover:bg-[#f7f8fa] sm:w-auto"
        >
          + Add item
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        {draft.items.map((item) => (
          <div
            key={item.key}
            className="grid gap-3 rounded-lg border border-[#e5e7eb] bg-[#f7f8fa] p-4 md:grid-cols-[1fr_100px_140px_auto]"
          >
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Item</span>
              <input
                value={item.name}
                onChange={(event) =>
                  onUpdateItem(item.key, "name", event.target.value)
                }
                placeholder="Chicken rice"
                className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
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
                placeholder="1"
                className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
              />
            </label>

            <MoneyInput
              label="Unit price"
              value={item.unitAmount}
              placeholder="12.50"
              onChange={(value) => onUpdateItem(item.key, "unitAmount", value)}
            />

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => onRemoveItem(item.key)}
                disabled={draft.items.length === 1}
                className="w-full rounded-full border border-[#0a0a0a] bg-white px-6 py-[11px] text-sm font-semibold text-[#0a0a0a] hover:bg-white disabled:cursor-not-allowed disabled:border-[#e5e7eb] disabled:bg-[#e5e7eb] disabled:text-[#a8aab2] sm:w-auto"
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
        <p className="mt-4 rounded-lg bg-[#f7f8fa] px-4 py-3 text-sm text-zinc-600">
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
                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                  selectedItemKey === item.key
                    ? "border-[#1d4ed8] bg-white"
                    : "border-[#e5e7eb] bg-[#f7f8fa] hover:bg-white"
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
                className="rounded-lg border border-[#e5e7eb] bg-[#f7f8fa] p-4"
              >
                <button
                  type="button"
                  onClick={() => onAssignSelectedItem(participant.key)}
                  disabled={!selectedItemKey}
                  className="flex w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block break-words font-medium">
                      {participant.name}
                    </span>
                    {participant.phone ? (
                      <span className="block break-all text-sm text-zinc-500">
                        {participant.phone}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm font-medium text-[#1d4ed8]">
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
                          className="flex flex-col gap-2 rounded-lg bg-[#f7f8fa] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span className="min-w-0 break-words">
                            {item?.name || "Item"} -{" "}
                            {formatMoney(
                              (parseMoneyToCents(item?.unitAmount ?? "") ?? 0) / 100
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => onRemoveAssignment(assignment.id)}
                            className="self-start text-xs font-medium text-zinc-600 hover:text-zinc-950 sm:self-auto"
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
  description,
  formId,
  isSaving,
  onErrorSelect,
  receiptPayload,
  review,
  saveAction,
  saveError,
  submitPlacement = "inline",
}: {
  description: string;
  formId?: string;
  isSaving: boolean;
  onErrorSelect?: (error: string) => void;
  receiptPayload: string;
  review: ReturnType<typeof buildReview> | null;
  saveAction: (payload: FormData) => void;
  saveError?: string;
  submitPlacement?: "inline" | "external";
}) {
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6">
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
            className="flex items-start justify-between gap-3 rounded-lg bg-[#f7f8fa] px-3 py-2 text-sm"
          >
            <span className="min-w-0 break-words">{participant.name}</span>
            <span className="shrink-0 font-medium">
              {formatMoney(participant.totalCents / 100)}
            </span>
          </div>
        ))}
      </div>

      {review && review.errors.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {onErrorSelect ? (
            <>
              <p className="font-medium">Review these issues before saving:</p>
              <ul className="mt-2 grid gap-1">
                {review.errors.map((error) => (
                  <li key={error}>
                    <button
                      type="button"
                      onClick={() => onErrorSelect(error)}
                      className="text-left underline decoration-amber-400 underline-offset-2"
                    >
                      {error}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <ul className="list-inside list-disc">
              {review.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {saveError ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      ) : null}

      <form id={formId} action={saveAction} className="mt-5 grid gap-5">
        <input type="hidden" name="description" value={description} />
        <input type="hidden" name="receiptPayload" value={receiptPayload} />
        <ReminderFrequencyPicker />
        {submitPlacement === "inline" ? (
          <div className="flex justify-stretch sm:justify-end">
            <button
              type="submit"
              disabled={!review?.canSave || isSaving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0a0a0a] px-6 py-[11px] text-sm font-semibold text-white hover:bg-[#222222] disabled:cursor-not-allowed disabled:bg-[#e5e7eb] disabled:text-[#a8aab2] sm:w-auto"
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
        ) : null}
      </form>
    </div>
  );
}

function MoneyInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        step="0.01"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-md border border-[#e5e7eb] bg-white px-4 outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
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

function getNextUnassignedItem(
  items: ClientReceiptItem[],
  currentItemKey: string,
  assignments: Assignment[]
) {
  const currentIndex = items.findIndex((item) => item.key === currentItemKey);
  if (currentIndex < 0) return null;

  for (let offset = 1; offset < items.length; offset += 1) {
    const item = items[(currentIndex + offset) % items.length];
    if (getRemainingQuantity(item, assignments) > 0) return item;
  }

  return null;
}

function getMobileErrorStep(
  error: string,
  splitMode: SplitMode
): MobileStep {
  if (
    error === "Add a description." ||
    error === "Receipt subtotal and total must be above RM0.00." ||
    error === "Tax and service charge cannot be negative." ||
    error === "Subtotal, tax, service, and rounding must match total."
  ) {
    return "DETAILS";
  }

  if (
    error === "Complete each inline friend." ||
    error === "Add at least one friend."
  ) {
    return "PEOPLE";
  }

  if (
    error === "Assign at least one amount to a friend." &&
    splitMode === "EQUAL_SPLIT"
  ) {
    return "PEOPLE";
  }

  return "ITEMS";
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

function createClientReceiptItem(items: ClientReceiptItem[]): ClientReceiptItem {
  return {
    key: `item-${getNextItemNumber(items)}`,
    name: "",
    quantity: "1",
    unitAmount: "",
  };
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
