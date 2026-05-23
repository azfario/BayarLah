export const dynamic = "force-dynamic";

import Link from "next/link";
import { Prisma } from "@prisma/client";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { ensureUserInDB } from "@/lib/actions/user";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { isProfileComplete } from "@/lib/profile";
import { getReminderStatusLabel } from "@/lib/reminders";

type SharePaymentStatus = {
  id: string;
  paidAt: Date | null;
};

export default async function DashboardPage() {
  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

  const dbUser = await ensureUserInDB();
  if (!isProfileComplete(dbUser)) redirect("/profile?next=/dashboard");

  const [expenses, expenseCount] = await Promise.all([
    prisma.expense.findMany({
      where: { collectorId: dbUser.id },
      orderBy: { createdAt: "desc" },
      take: 6,
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
      },
    }),
    prisma.expense.count({ where: { collectorId: dbUser.id } }),
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

  const unpaidShares = expenses.flatMap((expense) =>
    expense.shares
      .filter((share) => !paidAtByShareId.get(share.id))
      .map((share) => ({
        ...share,
        expenseDescription: expense.description,
        expenseCreatedAt: expense.createdAt,
      }))
  );
  const receivableTotal = unpaidShares.reduce(
    (total, share) => total + Number(share.owedAmount.toString()),
    0
  );
  const activeReminderCount = unpaidShares.filter(
    (share) => share.reminderStatus === "ACTIVE"
  ).length;
  const totalUnpaidShares = unpaidShares.length;

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-[#0a0a0a] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-6 border-b border-[#e5e7eb] pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#ff5530]">BayarLah</p>
            <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-[-0.5px] text-[#0a0a0a] sm:text-5xl">
              Dashboard
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#5f5f5f]">
              Logged in as {clerkUser.emailAddresses[0]?.emailAddress}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/expenses"
              className="inline-flex items-center justify-center rounded-full bg-[#0a0a0a] px-6 py-3 text-sm font-semibold text-white"
            >
              Create expense
            </Link>
            <Link
              href="/friends"
              className="inline-flex items-center justify-center rounded-full border border-[#0a0a0a] px-5 py-3 text-sm font-semibold text-[#0a0a0a]"
            >
              Friends
            </Link>
            <Link
              href="/profile"
              className="inline-flex items-center justify-center rounded-full border border-[#e5e7eb] bg-white px-5 py-3 text-sm font-semibold text-[#0a0a0a]"
            >
              Profile
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            tone="coral"
            label="You owe"
            value={formatMoney(0)}
            detail="Incoming debts are not connected in this demo yet."
          />
          <MetricCard
            tone="blue"
            label="Receivable"
            value={formatMoney(receivableTotal)}
            detail="Unpaid friend shares from expenses you collected."
          />
          <MetricCard
            tone="magenta"
            label="Unpaid shares"
            value={String(totalUnpaidShares)}
            detail="Friends still marked unpaid across recent expenses."
          />
          <MetricCard
            tone="purple"
            label="Active reminders"
            value={String(activeReminderCount)}
            detail="Unpaid shares with WhatsApp reminder schedules."
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
          <section className="min-w-0 rounded-2xl border border-[#e5e7eb] bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold leading-tight tracking-[-0.25px]">
                  Recent expenses
                </h2>
                <p className="mt-1 text-sm text-[#5f5f5f]">
                  Showing {expenses.length} of {expenseCount}
                </p>
              </div>
              <Link
                href="/expenses"
                className="inline-flex items-center justify-center rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-semibold text-[#0a0a0a]"
              >
                View all
              </Link>
            </div>

            {expenses.length > 0 ? (
              <div className="mt-6 divide-y divide-[#eaecf0]">
                {expenses.map((expense) => {
                  const unpaidTotal = expense.shares
                    .filter((share) => !paidAtByShareId.get(share.id))
                    .reduce(
                      (total, share) =>
                        total + Number(share.owedAmount.toString()),
                      0
                    );
                  const paidCount = expense.shares.filter(
                    (share) => paidAtByShareId.get(share.id)
                  ).length;

                  return (
                    <article
                      key={expense.id}
                      className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-semibold">
                            {expense.description}
                          </h3>
                          <span className="rounded-full bg-[#bfdbfe] px-3 py-1 text-xs font-semibold text-[#1d4ed8]">
                            {expense.splitMode === "EQUAL_SPLIT"
                              ? "Equal split"
                              : "Custom"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[#5f5f5f]">
                          {expenseDateFormatter.format(expense.createdAt)} ·{" "}
                          {expense.shares.length} friend
                          {expense.shares.length === 1 ? "" : "s"} · {paidCount}{" "}
                          paid
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {expense.shares.slice(0, 4).map((share) => (
                            <span
                              key={share.id}
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                paidAtByShareId.get(share.id)
                                  ? "bg-[#e8ffea] text-[#1ba673]"
                                  : "bg-[#f2f3f5] text-[#45515e]"
                              }`}
                            >
                              {share.friend.name}
                            </span>
                          ))}
                          {expense.shares.length > 4 ? (
                            <span className="rounded-full bg-[#f2f3f5] px-3 py-1 text-xs font-semibold text-[#45515e]">
                              +{expense.shares.length - 4}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex min-w-[150px] flex-col gap-1 text-left md:text-right">
                        <span className="text-xs font-semibold uppercase text-[#8e8e93]">
                          Unpaid
                        </span>
                        <span className="text-2xl font-semibold">
                          {formatMoney(unpaidTotal)}
                        </span>
                        <span className="text-sm text-[#5f5f5f]">
                          Total {formatMoney(expense.totalAmount)}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl bg-[#f7f8fa] p-6">
                <p className="text-sm font-medium text-[#222222]">
                  No expenses yet.
                </p>
                <p className="mt-2 text-sm leading-6 text-[#5f5f5f]">
                  Create a manual or receipt expense to start tracking who owes
                  what.
                </p>
              </div>
            )}
          </section>

          <section className="min-w-0 rounded-2xl border border-[#e5e7eb] bg-[#f7f8fa] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold leading-tight tracking-[-0.25px]">
                  Reminder status
                </h2>
                <p className="mt-1 text-sm text-[#5f5f5f]">
                  Latest unpaid shares ready for demo follow-up.
                </p>
              </div>
              <span className="rounded-full bg-[#0a0a0a] px-3 py-1 text-xs font-semibold text-white">
                {activeReminderCount} active
              </span>
            </div>

            {unpaidShares.length > 0 ? (
              <div className="mt-6 divide-y divide-[#e5e7eb]">
                {unpaidShares.slice(0, 6).map((share) => {
                  const latestAttempt = share.whatsappReminderAttempts[0];

                  return (
                    <article key={share.id} className="py-4 first:pt-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {share.friend.name}
                          </p>
                          <p className="mt-1 truncate text-sm text-[#5f5f5f]">
                            {share.expenseDescription}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#0a0a0a]">
                          {formatMoney(share.owedAmount)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[#45515e]">
                        {getReminderStatusLabel(share)}
                      </p>
                      {latestAttempt ? (
                        <p className="mt-1 text-xs leading-5 text-[#5f5f5f]">
                          {getWhatsAppAttemptLabel(latestAttempt)}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs leading-5 text-[#8e8e93]">
                          No WhatsApp attempt yet
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl bg-white p-6">
                <p className="text-sm font-medium text-[#222222]">
                  Nothing unpaid right now.
                </p>
                <p className="mt-2 text-sm leading-6 text-[#5f5f5f]">
                  New unpaid shares with reminder schedules will appear here.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

type MetricCardProps = {
  detail: string;
  label: string;
  tone: "blue" | "coral" | "magenta" | "purple";
  value: string;
};

const metricToneClass: Record<MetricCardProps["tone"], string> = {
  blue: "bg-[#1456f0]",
  coral: "bg-[#ff5530]",
  magenta: "bg-[#ea5ec1]",
  purple: "bg-[#a855f7]",
};

function MetricCard({ detail, label, tone, value }: MetricCardProps) {
  return (
    <article
      className={`${metricToneClass[tone]} flex min-h-[180px] flex-col justify-between rounded-[32px] p-6 text-white`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <div>
        <p className="text-4xl font-semibold leading-tight tracking-[-0.5px]">
          {value}
        </p>
        <p className="mt-3 text-sm leading-6 text-white/85">{detail}</p>
      </div>
    </article>
  );
}

const expenseDateFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const whatsappAttemptDateFormatter = new Intl.DateTimeFormat("en-MY", {
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
