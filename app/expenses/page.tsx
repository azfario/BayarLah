import Link from "next/link";
import { Prisma } from "@prisma/client";
import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import ExpenseCreateTabs from "@/app/expenses/ExpenseCreateTabs";
import StatusToast from "@/components/StatusToast";
import SubmitButton from "@/components/SubmitButton";
import {
  deleteExpense,
  markExpenseSharePaid,
  markExpenseShareUnpaid,
  queueExpenseShareReminderNow,
} from "@/lib/actions/expenses";
import { ensureUserInDB } from "@/lib/actions/user";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { isProfileComplete } from "@/lib/profile";
import { getReminderStatusLabel } from "@/lib/reminders";

export const dynamic = "force-dynamic";

type ExpensesPageProps = {
  searchParams: Promise<{
    error?: string;
    mode?: string;
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

  const [params, friends, expenses, expenseCount] = await Promise.all([
    searchParams,
    prisma.friend.findMany({
      where: { ownerId: user.id },
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
      select: { id: true, name: true, phone: true },
    }),
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
  ]);
  const shareIds = expenses.flatMap((expense) =>
    expense.shares.map((share) => share.id)
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

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-emerald-700">BayarLah</p>
            <h1 className="text-3xl font-bold">Expenses</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm font-medium text-zinc-600 hover:text-zinc-950">
              Dashboard
            </Link>
            <Link href="/friends" className="text-sm font-medium text-zinc-600 hover:text-zinc-950">
              Friends
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        <StatusToast error={params.error} success={params.success} />

        <ExpenseCreateTabs
          friends={friends}
          collectorName={user.fullName ?? clerkUser.firstName ?? "You"}
          initialMode={params.mode === "receipt" ? "receipt" : "manual"}
        />

        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Recent expenses</h2>
            <span className="text-sm text-zinc-500">
              Showing {expenses.length} of {expenseCount}
            </span>
          </div>

          {expenses.length > 0 ? (
            <div className="mt-4 divide-y divide-zinc-100">
              {expenses.map((expense) => (
                <article key={expense.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{expense.description}</h3>
                      <p className="text-sm text-zinc-500">
                        {expense.splitMode === "EQUAL_SPLIT" ? "Equal split" : "Custom amounts"} -{" "}
                        Total paid {formatMoney(expense.totalAmount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-zinc-500">
                        Your amount {formatMoney(expense.collectorAmount)}
                      </p>
                      <form action={deleteExpense}>
                        <input type="hidden" name="expenseId" value={expense.id} />
                        <SubmitButton
                          variant="danger"
                          pendingLabel="Removing..."
                          className="px-3 py-2 text-sm"
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
                          className="flex items-start justify-between gap-3 rounded-md bg-zinc-50 px-3 py-2 text-sm"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span>
                                {share.friend.name}{" "}
                                <span className="text-zinc-500">({share.friend.phone})</span>
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  isPaid
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {isPaid ? "Paid" : "Unpaid"}
                              </span>
                            </div>
                            {latestAttempt ? (
                              <span className="mt-1 block text-xs text-zinc-500">
                                {getWhatsAppAttemptLabel(latestAttempt)}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-col items-end gap-2 text-right">
                            <span>
                              <span className="block font-medium">
                                {formatMoney(share.owedAmount)}
                              </span>
                              <span className="block text-xs text-zinc-500">
                                {paidAt
                                  ? `Paid ${sharePaidDateFormatter.format(paidAt)}`
                                  : getReminderStatusLabel(share)}
                              </span>
                            </span>
                            {!isPaid && share.reminderStatus === "ACTIVE" ? (
                              <form action={queueExpenseShareReminderNow}>
                                <input type="hidden" name="shareId" value={share.id} />
                                <SubmitButton
                                  variant="secondary"
                                  pendingLabel="Queueing..."
                                  className="px-3 py-1 text-xs"
                                >
                                  Send now
                                </SubmitButton>
                              </form>
                            ) : null}
                            <form
                              action={
                                isPaid ? markExpenseShareUnpaid : markExpenseSharePaid
                              }
                            >
                              <input type="hidden" name="shareId" value={share.id} />
                              <SubmitButton
                                variant="secondary"
                                pendingLabel={isPaid ? "Marking..." : "Settling..."}
                                className="px-3 py-1 text-xs"
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
                    <div className="mt-4 rounded-md border border-emerald-100 bg-emerald-50 p-4">
                      <div className="flex flex-wrap items-center gap-3 text-sm text-emerald-900">
                        {expense.receiptMerchantName ? (
                          <span className="font-medium">
                            {expense.receiptMerchantName}
                          </span>
                        ) : null}
                        {expense.receiptDate ? <span>{expense.receiptDate}</span> : null}
                        <span className="text-emerald-700">
                          Receipt items saved. Photo was not stored.
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2">
                        {expense.receiptItems.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-md bg-white px-3 py-2 text-sm"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium">{item.name}</span>
                              <span>{formatMoney(item.amount)}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
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
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              Record your first expense to see who owes what.
            </p>
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
