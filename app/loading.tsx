export default function Loading() {
  return (
    <main
      className="grid min-h-screen place-items-center bg-white px-4 text-[#0a0a0a]"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-[#0a0a0a] text-sm font-semibold text-white">
          B
        </div>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#0a0a0a] border-t-transparent" />
        <p className="text-sm font-medium text-[#5f5f5f]">Loading BayarLah...</p>
      </div>
    </main>
  );
}
