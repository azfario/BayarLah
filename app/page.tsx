import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

const featureCards = [
  {
    title: "Receipt split",
    body: "Turn a shared meal into clear friend-by-friend amounts.",
    className: "bg-[#ff5530] text-white",
  },
  {
    title: "Friend ledger",
    body: "Keep names, numbers, and unpaid shares in one place.",
    className: "bg-[#ea5ec1] text-white",
  },
  {
    title: "DuitNow ready",
    body: "Show exactly where friends should send the money.",
    className: "bg-[#1456f0] text-white",
  },
  {
    title: "Soft reminders",
    body: "Send WhatsApp nudges without rewriting the same message.",
    className: "bg-[#a855f7] text-white",
  },
];

const previewRows = [
  { name: "Alya", amount: "RM 28.40", status: "Paid" },
  { name: "Ben", amount: "RM 31.90", status: "Reminder set" },
  { name: "Kai", amount: "RM 24.20", status: "Waiting" },
];

export default async function Home() {
  const { userId } = await auth();

  return (
    <main className="min-h-screen bg-white text-[#0a0a0a]">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 text-sm font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#0a0a0a] text-white">
            B
          </span>
          <span>BayarLah</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {userId ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full bg-[#0a0a0a] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="hidden items-center justify-center rounded-full border border-[#e5e7eb] bg-white px-5 py-2.5 text-sm font-semibold text-[#0a0a0a] sm:inline-flex"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center rounded-full bg-[#0a0a0a] px-5 py-2.5 text-sm font-semibold text-white"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </nav>

      <section className="mx-auto grid w-full max-w-7xl gap-12 px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.86fr)] lg:items-center lg:px-8">
        <div className="max-w-3xl">
          <p className="mb-5 inline-flex rounded-full bg-[#e8ffea] px-4 py-1.5 text-sm font-semibold text-[#1ba673]">
            Split now, chase less later
          </p>
          <h1 className="text-6xl font-semibold leading-none text-[#0a0a0a] sm:text-7xl lg:text-8xl">
            BayarLah
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#45515e] sm:text-xl">
            Track group expenses, see who still owes what, and send clean
            reminders without turning dinner into admin work.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {userId ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-full bg-[#0a0a0a] px-7 py-3 text-sm font-semibold text-white"
              >
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/sign-up"
                  className="inline-flex items-center justify-center rounded-full bg-[#0a0a0a] px-7 py-3 text-sm font-semibold text-white"
                >
                  Create account
                </Link>
                <Link
                  href="/sign-in"
                  className="inline-flex items-center justify-center rounded-full border border-[#0a0a0a] px-7 py-3 text-sm font-semibold text-[#0a0a0a]"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-4" aria-label="BayarLah expense preview">
          <section className="rounded-[32px] bg-[#0a0a0a] p-6 text-white sm:p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm font-semibold text-white/70">
                  Dinner at Jalan Alor
                </p>
                <p className="mt-3 text-5xl font-semibold leading-none">
                  RM 84.50
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#0a0a0a]">
                3 friends
              </span>
            </div>

            <div className="mt-8 divide-y divide-white/15">
              {previewRows.map((row) => (
                <div
                  key={row.name}
                  className="grid grid-cols-[1fr_auto] gap-4 py-4"
                >
                  <div>
                    <p className="font-semibold">{row.name}</p>
                    <p className="mt-1 text-sm text-white/65">{row.status}</p>
                  </div>
                  <p className="text-right font-semibold">{row.amount}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            {featureCards.map((card) => (
              <article
                key={card.title}
                className={`${card.className} min-h-44 rounded-[32px] p-6`}
              >
                <p className="text-xl font-semibold leading-tight">
                  {card.title}
                </p>
                <p className="mt-4 text-sm leading-6 text-white/85">
                  {card.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#e5e7eb] bg-[#f7f8fa] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          <Metric label="Unpaid shares" value="Visible" />
          <Metric label="Reminder status" value="Trackable" />
          <Metric label="Collector flow" value="Clear" />
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
      <p className="text-sm font-medium text-[#5f5f5f]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#0a0a0a]">{value}</p>
    </article>
  );
}
