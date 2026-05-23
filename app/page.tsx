import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { userId } = await auth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">BayarLah</h1>
      <p className="text-gray-500">no more that awkward moment when you have to ask for money ^_^</p>
      {userId ? (
        <Link
          href="/dashboard"
          className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
        >
          Go to Dashboard
        </Link>
      ) : (
        <Link
          href="/sign-in"
          className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
        >
          Sign In
        </Link>
      )}
    </div>
  );
}
