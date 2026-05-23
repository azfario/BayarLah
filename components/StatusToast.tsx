type StatusToastProps = {
  error?: string;
  success?: string;
};

export default function StatusToast({ error, success }: StatusToastProps) {
  if (!error && !success) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col-reverse gap-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-full sm:max-w-sm sm:flex-col">
      {error ? (
        <div
          role="alert"
          className="pointer-events-auto rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg shadow-red-950/10"
        >
          {error}
        </div>
      ) : null}

      {success ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-auto rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-lg shadow-emerald-950/10"
        >
          {success}
        </div>
      ) : null}
    </div>
  );
}
