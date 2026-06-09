import Link from "next/link";
import { Prisma } from "@prisma/client";
import { currentUser } from "@clerk/nextjs/server";
import Header from "@/components/Header";
import ImageLightbox from "@/components/ImageLightbox";
import MobileExpenseDisclosure from "@/components/MobileExpenseDisclosure";
import { redirect } from "next/navigation";
import StatusToast from "@/components/StatusToast";
import SubmitButton from "@/components/SubmitButton";
import {
  confirmPaymentProof,
  deleteExpense,
  markExpenseSharePaid,
  markExpenseShareUnpaid,
  queueExpenseShareReminderNow,
  rejectPaymentProof,
} from "@/lib/actions/expenses";
import { ensureUserInDB } from "@/lib/actions/user";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { isProfileComplete } from "@/lib/profile";
import { getReminderStatusLabel } from "@/lib/reminders";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ExpensesPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

type SharePaymentStatus = {
  id: string;
  paidAt: Date | null;
};

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

  const user = await ensureUserInDB();
  if (!isProfileComplete(user)) redirect("/profile?next=/expenses");

  const [params, expenses, expenseCount, pendingProofs] = await Promise.all([
    searchParams,
    prisma.expense.findMany({
      where: { collectorId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        shares: {
          include: {
            friend: true,
            whatsappReminderAttempts: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
          orderBy: { createdAt: "asc" },
        },
        receiptItems: {
          include: {
            allocations: {
              include: { friend: true },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    prisma.expense.count({
      where: { collectorId: user.id },
    }),
    prisma.paymentProof.findMany({
      where: {
        collectorId: user.id,
        status: "PENDING_REVIEW",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        debtorFriend: true,
        expenseShare: {
          include: {
            friend: true,
            expense: {
              select: { description: true },
            },
          },
        },
      },
    }),
  ]);
  const shareIds = expenses.flatMap((expense) =>
    expense.shares.map((share) => share.id)
  );
  const paymentProofCodes =
    pendingProofs.length > 0
      ? await prisma.$queryRaw<{ id: string; parsedPaymentCode: string | null }[]>(
          Prisma.sql`
            SELECT "id", "parsedPaymentCode"
            FROM "PaymentProof"
            WHERE "id" IN (${Prisma.join(pendingProofs.map((proof) => proof.id))})
          `
        )
      : [];
  const paymentCodeByProofId = new Map(
    paymentProofCodes.map((proof) => [proof.id, proof.parsedPaymentCode])
  );
  const sharePaymentStatuses =
    shareIds.length > 0
      ? await prisma.$queryRaw<SharePaymentStatus[]>(Prisma.sql`
          SELECT "id", "paidAt"
          FROM "ExpenseShare"
          WHERE "id" IN (${Prisma.join(shareIds)})
        `)
      : [];
  const paidAtByShareId = new Map(
    sharePaymentStatuses.map((status) => [status.id, status.paidAt])
  );
  const pendingProofDebtorFriendIds = pendingProofs
    .map((proof) => proof.debtorFriendId)
    .filter((id): id is string => Boolean(id));
  const needsCollectorWideProofCandidates = pendingProofs.some(
    (proof) => !proof.debtorFriendId
  );
  const pendingProofCandidateShares =
    pendingProofs.length > 0 &&
    (needsCollectorWideProofCandidates || pendingProofDebtorFriendIds.length > 0)
      ? await prisma.expenseShare.findMany({
          where: {
            ...(needsCollectorWideProofCandidates
              ? {}
              : { friendId: { in: pendingProofDebtorFriendIds } }),
            paidAt: null,
            expense: { collectorId: user.id },
          },
          orderBy: { createdAt: "desc" },
          include: {
            friend: true,
            expense: {
              select: { description: true },
            },
          },
        })
      : [];
  const candidateSharesByFriendId = new Map<
    string,
    typeof pendingProofCandidateShares
  >();
  for (const share of pendingProofCandidateShares) {
    const shares = candidateSharesByFriendId.get(share.friendId) ?? [];
    shares.push(share);
    candidateSharesByFriendId.set(share.friendId, shares);
  }
  const proofImageUrlById = await getPaymentProofImageUrls(pendingProofs);

  return (
    <main className="min-h-screen bg-white px-4 py-5 text-[#0a0a0a] sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <Header title="Expenses" />

        <StatusToast error={params.error} success={params.success} />

        {pendingProofs.length > 0 ? (
          <section className="rounded-2xl border border-[#e5e7eb] bg-[#f7f8fa] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Payment reviews</h2>
                <p className="text-sm text-[#5f5f5f]">
                  Confirm only when the receipt recipient and debt look right.
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
                {pendingProofs.length} pending
              </span>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {pendingProofs.map((proof) => {
                const parsedAmountCents = proof.parsedAmount
                  ? Math.round(Number(proof.parsedAmount.toString()) * 100)
                  : null;
                const candidateShares = proof.debtorFriendId
                  ? candidateSharesByFriendId.get(proof.debtorFriendId) ?? []
                  : parsedAmountCents === null
                    ? []
                    : pendingProofCandidateShares;
                const exactAmountCandidates =
                  parsedAmountCents === null
                    ? candidateShares
                    : candidateShares.filter(
                        (share) =>
                          Math.round(Number(share.owedAmount.toString()) * 100) ===
                          parsedAmountCents
                      );
                const confirmCandidates = proof.expenseShare
                  ? [proof.expenseShare]
                  : exactAmountCandidates;
                const imageUrl = proofImageUrlById.get(proof.id);

                return (
                  <article
                    key={proof.id}
                    className="rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-5"
                  >
                    <div className="grid gap-4 md:grid-cols-[140px_1fr]">
                      <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
                        {imageUrl ? (
                          <ImageLightbox
                            src={imageUrl}
                            alt="Payment proof screenshot"
                            className="h-44 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-44 items-center justify-center px-3 text-center text-sm text-zinc-500">
                            Image unavailable
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">
                            {proof.debtorFriend?.name ?? "Unknown debtor"}
                          </h3>
                          {proof.debtorFriend ? (
                            <span className="text-sm text-[#5f5f5f]">
                              {proof.debtorFriend.phone}
                            </span>
                          ) : null}
                        </div>
                        <dl className="mt-3 grid gap-2 text-sm">
                          <PaymentProofField
                            label="Amount"
                            value={
                              proof.parsedAmount
                                ? formatMoney(proof.parsedAmount)
                                : "Not found"
                            }
                          />
                          <PaymentProofField
                            label="Recipient"
                            value={proof.parsedRecipient ?? "Not found"}
                          />
                          <PaymentProofField
                            label="Reference"
                            value={proof.parsedTransactionReference ?? "Not found"}
                          />
                          <PaymentProofField
                            label="Payment code"
                            value={paymentCodeByProofId.get(proof.id) ?? "Not found"}
                          />
                          <PaymentProofField
                            label="Timestamp"
                            value={
                              proof.parsedTimestamp
                                ? proofTimestampFormatter.format(proof.parsedTimestamp)
                                : "Not found"
                            }
                          />
                          <PaymentProofField
                            label="Reason"
                            value={proof.reviewReason ?? "Needs collector review."}
                          />
                        </dl>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-[#e5e7eb] pt-4">
                      <p className="text-sm font-medium text-[#0a0a0a]">
                        Suggested debt
                      </p>
                      {confirmCandidates.length > 0 ? (
                        <div className="mt-2 grid gap-2">
                          {confirmCandidates.map((share) => (
                            <div
                              key={share.id}
                              className="flex flex-col gap-3 rounded-xl border border-[#e5e7eb] bg-[#f7f8fa] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0">
                                <p className="break-words font-medium">
                                  {share.friend.name} - {formatMoney(share.owedAmount)}
                                </p>
                                <p className="break-words text-[#5f5f5f]">
                                  {share.expense.description}
                                </p>
                              </div>
                              <form action={confirmPaymentProof} className="w-full sm:w-auto">
                                <input
                                  type="hidden"
                                  name="paymentProofId"
                                  value={proof.id}
                                />
                                <input type="hidden" name="shareId" value={share.id} />
                                <SubmitButton
                                  pendingLabel="Confirming..."
                                  className="w-full px-3 py-2 text-xs sm:w-auto sm:py-1"
                                >
                                  Confirm
                                </SubmitButton>
                              </form>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 rounded-xl border border-[#e5e7eb] bg-[#f7f8fa] px-3 py-2 text-sm text-[#5f5f5f]">
                          No exact unpaid debt candidate. Reject this proof or wait for a clearer receipt.
                        </p>
                      )}

                      <form action={rejectPaymentProof} className="mt-3">
                        <input type="hidden" name="paymentProofId" value={proof.id} />
                        <SubmitButton
                          variant="danger"
                          pendingLabel="Rejecting..."
                          className="w-full px-3 py-2 text-xs sm:w-auto sm:py-1"
                        >
                          Reject
                        </SubmitButton>
                      </form>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <h2 className="text-xl font-semibold">Recent expenses</h2>
            <span className="text-sm text-[#5f5f5f]">
              Showing {expenses.length} of {expenseCount}
            </span>
          </div>

          {expenses.length > 0 ? (
            <div className="mt-4 divide-y divide-[#eaecf0]">
              {expenses.slice(0, 1).map((expense) => (
                <article key={expense.id} className="py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold">{expense.description}</h3>
                      <p className="text-sm text-[#5f5f5f]">
                        {expense.splitMode === "EQUAL_SPLIT" ? "Equal split" : "Custom amounts"} -{" "}
                        Total paid {formatMoney(expense.totalAmount)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:items-end">
                      <p className="text-sm text-[#5f5f5f] sm:text-right">
                        Your amount {formatMoney(expense.collectorAmount)}
                      </p>
                      <form action={deleteExpense} className="w-full sm:w-auto">
                        <input type="hidden" name="expenseId" value={expense.id} />
                        <SubmitButton
                          variant="danger"
                          pendingLabel="Removing..."
                          className="w-full px-3 py-2 text-sm sm:w-auto"
                        >
                          Remove
                        </SubmitButton>
                      </form>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {expense.shares.map((share) => {
                      const latestAttempt = share.whatsappReminderAttempts[0];
                      const paidAt = paidAtByShareId.get(share.id) ?? null;
                      const isPaid = Boolean(paidAt);

                      return (
                        <div
                          key={share.id}
                          className="flex flex-col gap-3 rounded-xl bg-[#f7f8fa] px-3 py-3 text-sm sm:flex-row sm:items-start sm:justify-between sm:py-2"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="break-words">
                                {share.friend.name}{" "}
                                <span className="break-all text-zinc-500">
                                  ({share.friend.phone})
                                </span>
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  isPaid
                                    ? "bg-[#e8ffea] text-[#1ba673]"
                                    : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {isPaid ? "Paid" : "Unpaid"}
                              </span>
                            </div>
                            {latestAttempt ? (
                              <span className="mt-1 block text-xs text-[#5f5f5f]">
                                {getWhatsAppAttemptLabel(latestAttempt)}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex w-full flex-col items-stretch gap-2 text-left sm:w-auto sm:items-end sm:text-right">
                            <span>
                              <span className="block font-medium">
                                {formatMoney(share.owedAmount)}
                              </span>
                              <span className="block text-xs text-[#5f5f5f]">
                                {paidAt
                                  ? `Paid ${sharePaidDateFormatter.format(paidAt)}`
                                  : getReminderStatusLabel(share)}
                              </span>
                            </span>
                            {!isPaid && share.reminderStatus === "ACTIVE" ? (
                              <form
                                action={queueExpenseShareReminderNow}
                                className="w-full sm:w-auto"
                              >
                                <input type="hidden" name="shareId" value={share.id} />
                                <SubmitButton
                                  variant="secondary"
                                  pendingLabel="Queueing..."
                                  className="w-full px-3 py-2 text-xs sm:w-auto sm:py-1"
                                >
                                  Send now
                                </SubmitButton>
                              </form>
                            ) : null}
                            <form
                              action={
                                isPaid ? markExpenseShareUnpaid : markExpenseSharePaid
                              }
                              className="w-full sm:w-auto"
                            >
                              <input type="hidden" name="shareId" value={share.id} />
                              <SubmitButton
                                variant="secondary"
                                pendingLabel={isPaid ? "Marking..." : "Settling..."}
                                className="w-full px-3 py-2 text-xs sm:w-auto sm:py-1"
                              >
                                {isPaid ? "Mark unpaid" : "Mark paid"}
                              </SubmitButton>
                            </form>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {expense.receiptItems.length > 0 ? (
                    <div className="mt-4 rounded-2xl border border-[#e5e7eb] bg-[#f7f8fa] p-4">
                      <div className="flex flex-wrap items-center gap-3 text-sm text-[#0a0a0a]">
                        {expense.receiptMerchantName ? (
                          <span className="font-medium">
                            {expense.receiptMerchantName}
                          </span>
                        ) : null}
                        {expense.receiptDate ? <span>{expense.receiptDate}</span> : null}
                        <span className="text-[#5f5f5f]">
                          Receipt items saved. Photo was not stored.
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2">
                        {expense.receiptItems.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-md bg-white px-3 py-2 text-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <span className="min-w-0 break-words font-medium">
                                {item.name}
                              </span>
                              <span className="shrink-0">{formatMoney(item.amount)}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#5f5f5f]">
                              {item.allocations.map((allocation) => (
                                <span key={allocation.id}>
                                  {allocation.participantType === "COLLECTOR"
                                    ? "You"
                                    : allocation.friend?.name ?? "Removed friend"}
                                  : {formatMoney(allocation.amount)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
              {expenses.length > 1 ? (
                <MobileExpenseDisclosure count={expenses.length - 1}>
                  {expenses.slice(1).map((expense) => (
                      <article key={expense.id} className="py-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h3 className="break-words font-semibold">{expense.description}</h3>
                            <p className="text-sm text-[#5f5f5f]">
                              {expense.splitMode === "EQUAL_SPLIT" ? "Equal split" : "Custom amounts"} -{" "}
                              Total paid {formatMoney(expense.totalAmount)}
                            </p>
                          </div>
                          <div className="flex flex-col gap-3 sm:items-end">
                            <p className="text-sm text-[#5f5f5f] sm:text-right">
                              Your amount {formatMoney(expense.collectorAmount)}
                            </p>
                            <form action={deleteExpense} className="w-full sm:w-auto">
                              <input type="hidden" name="expenseId" value={expense.id} />
                              <SubmitButton
                                variant="danger"
                                pendingLabel="Removing..."
                                className="w-full px-3 py-2 text-sm sm:w-auto"
                              >
                                Remove
                              </SubmitButton>
                            </form>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {expense.shares.map((share) => {
                            const latestAttempt = share.whatsappReminderAttempts[0];
                            const paidAt = paidAtByShareId.get(share.id) ?? null;
                            const isPaid = Boolean(paidAt);

                            return (
                              <div
                                key={share.id}
                                className="flex flex-col gap-3 rounded-xl bg-[#f7f8fa] px-3 py-3 text-sm sm:flex-row sm:items-start sm:justify-between sm:py-2"
                              >
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="break-words">
                                      {share.friend.name}{" "}
                                      <span className="break-all text-zinc-500">
                                        ({share.friend.phone})
                                      </span>
                                    </span>
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                        isPaid
                                          ? "bg-[#e8ffea] text-[#1ba673]"
                                          : "bg-amber-100 text-amber-700"
                                      }`}
                                    >
                                      {isPaid ? "Paid" : "Unpaid"}
                                    </span>
                                  </div>
                                  {latestAttempt ? (
                                    <span className="mt-1 block text-xs text-[#5f5f5f]">
                                      {getWhatsAppAttemptLabel(latestAttempt)}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex w-full flex-col items-stretch gap-2 text-left sm:w-auto sm:items-end sm:text-right">
                                  <span>
                                    <span className="block font-medium">
                                      {formatMoney(share.owedAmount)}
                                    </span>
                                    <span className="block text-xs text-[#5f5f5f]">
                                      {paidAt
                                        ? `Paid ${sharePaidDateFormatter.format(paidAt)}`
                                        : getReminderStatusLabel(share)}
                                    </span>
                                  </span>
                                  {!isPaid && share.reminderStatus === "ACTIVE" ? (
                                    <form
                                      action={queueExpenseShareReminderNow}
                                      className="w-full sm:w-auto"
                                    >
                                      <input type="hidden" name="shareId" value={share.id} />
                                      <SubmitButton
                                        variant="secondary"
                                        pendingLabel="Queueing..."
                                        className="w-full px-3 py-2 text-xs sm:w-auto sm:py-1"
                                      >
                                        Send now
                                      </SubmitButton>
                                    </form>
                                  ) : null}
                                  <form
                                    action={
                                      isPaid ? markExpenseShareUnpaid : markExpenseSharePaid
                                    }
                                    className="w-full sm:w-auto"
                                  >
                                    <input type="hidden" name="shareId" value={share.id} />
                                    <SubmitButton
                                      variant="secondary"
                                      pendingLabel={isPaid ? "Marking..." : "Settling..."}
                                      className="w-full px-3 py-2 text-xs sm:w-auto sm:py-1"
                                    >
                                      {isPaid ? "Mark unpaid" : "Mark paid"}
                                    </SubmitButton>
                                  </form>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {expense.receiptItems.length > 0 ? (
                          <div className="mt-4 rounded-2xl border border-[#e5e7eb] bg-[#f7f8fa] p-4">
                            <div className="flex flex-wrap items-center gap-3 text-sm text-[#0a0a0a]">
                              {expense.receiptMerchantName ? (
                                <span className="font-medium">
                                  {expense.receiptMerchantName}
                                </span>
                              ) : null}
                              {expense.receiptDate ? <span>{expense.receiptDate}</span> : null}
                              <span className="text-[#5f5f5f]">
                                Receipt items saved. Photo was not stored.
                              </span>
                            </div>

                            <div className="mt-3 grid gap-2">
                              {expense.receiptItems.map((item) => (
                                <div
                                  key={item.id}
                                  className="rounded-md bg-white px-3 py-2 text-sm"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <span className="min-w-0 break-words font-medium">
                                      {item.name}
                                    </span>
                                    <span className="shrink-0">{formatMoney(item.amount)}</span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#5f5f5f]">
                                    {item.allocations.map((allocation) => (
                                      <span key={allocation.id}>
                                        {allocation.participantType === "COLLECTOR"
                                          ? "You"
                                          : allocation.friend?.name ?? "Removed friend"}
                                        : {formatMoney(allocation.amount)}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </article>
                  ))}
                </MobileExpenseDisclosure>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-[#f7f8fa] px-4 py-5 text-sm text-[#5f5f5f]">
              <p>Record your first expense to see who owes what.</p>
              <Link
                href="/expenses/new"
                className="mt-3 inline-flex items-center justify-center rounded-full bg-[#0a0a0a] px-5 py-2.5 text-sm font-semibold text-white"
              >
                Create expense
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const whatsappAttemptDateFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

const sharePaidDateFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

const proofTimestampFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

function PaymentProofField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-zinc-500">{label}</dt>
      <dd className="break-all text-zinc-800">{value}</dd>
    </div>
  );
}

async function getPaymentProofImageUrls(
  proofs: { id: string; imageStoragePath: string }[]
) {
  const imageUrls = new Map<string, string>();
  if (proofs.length === 0) return imageUrls;

  const supabase = createServerSupabaseClient();
  await Promise.all(
    proofs.map(async (proof) => {
      const { data } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(proof.imageStoragePath, 60 * 5);
      if (data?.signedUrl) imageUrls.set(proof.id, data.signedUrl);
    })
  );

  return imageUrls;
}

function getWhatsAppAttemptLabel(attempt: {
  status: string;
  sentAt: Date | null;
  createdAt: Date;
  errorMessage: string | null;
}) {
  if (attempt.status === "SENT") {
    return `WhatsApp sent ${whatsappAttemptDateFormatter.format(
      attempt.sentAt ?? attempt.createdAt
    )}`;
  }

  if (attempt.status === "FAILED") {
    return `WhatsApp failed: ${attempt.errorMessage ?? "check worker logs"}`;
  }

  return "WhatsApp send pending";
}
