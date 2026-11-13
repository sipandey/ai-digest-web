"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#f4f4f8] flex items-center justify-center p-4">
      <div className="max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-xs">
        <h1 className="text-lg font-semibold text-[#14141e]">Dashboard unavailable</h1>
        <p className="mt-2 text-sm text-gray-600">
          We couldn&apos;t load your account right now. Please try again shortly.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
