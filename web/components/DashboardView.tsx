"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ── types ─────────────────────────────────────────────────────────────────────

type UserConfig = {
  notion_connected: boolean;
  topics: string[];
  experience_level: string;
  digest_hour: number;
  timezone_offset: number;
};

type PipelineRun = {
  id: string;
  run_date: string; // "YYYY-MM-DD"
  status: "pending" | "running" | "complete" | "failed" | "empty";
  papers_fetched: number;
  papers_passed: number;
  top_score: number | null;
  notion_page_url: string | null;
  error_message: string | null;
};

type UserProfile = {
  name: string | null;
};

// ── helpers ───────────────────────────────────────────────────────────────────

function greeting(timezoneOffset: number): string {
  const utcHour = new Date().getUTCHours();
  const localHour = (utcHour + timezoneOffset + 24) % 24;
  if (localHour < 12) return "Good morning";
  if (localHour < 18) return "Good afternoon";
  return "Good evening";
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatRunDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function padDigestHour(h: number): string {
  return String(h).padStart(2, "0") + ":00";
}

const STATUS_PILL: Record<PipelineRun["status"], string> = {
  complete: "bg-green-100 text-green-700",
  running: "bg-amber-100 text-amber-700",
  pending: "bg-gray-100 text-gray-600",
  failed: "bg-red-100 text-red-600",
  empty: "bg-blue-100 text-blue-700",
};

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: "Complete beginner",
  developer_learning_ai: "Developer learning AI",
  practitioner: "Practitioner",
  ml_engineer: "ML Engineer",
};

// ── skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className: string }) {
  return <div className={`bg-gray-200 rounded animate-pulse ${className}`} />;
}

// ── main component ────────────────────────────────────────────────────────────

export default function DashboardView() {
  const router = useRouter();

  const [config, setConfig] = useState<UserConfig | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [configRes, runsRes] = await Promise.all([
          fetch("/api/users/config"),
          fetch("/api/users/runs"),
        ]);

        if (configRes.status === 404) {
          router.replace("/onboarding");
          return;
        }

        const configData = await configRes.json();
        if (!configData.notion_connected) {
          router.replace("/onboarding");
          return;
        }

        setConfig(configData.config ?? configData);
        setProfile(configData.profile ?? null);
        setRuns((await runsRes.json()).runs ?? []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  async function triggerRun() {
    setTriggering(true);
    setTriggerError("");
    try {
      const res = await fetch("/api/pipeline/trigger", { method: "POST" });
      if (res.ok) {
        // Reload runs to show the new pending run
        const runsRes = await fetch("/api/users/runs");
        setRuns((await runsRes.json()).runs ?? []);
      } else {
        const data = await res.json();
        setTriggerError(data.error ?? "Trigger failed — please try again.");
      }
    } catch {
      setTriggerError("Network error — please try again.");
    } finally {
      setTriggering(false);
    }
  }

  // ── loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const today = todayISO();
  const todayRun = runs.find((r) => r.run_date === today) ?? null;
  const userName = profile?.name?.split(" ")[0] ?? null;
  const tz = config?.timezone_offset ?? 0;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── SECTION 1: Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting(tz)}{userName ? `, ${userName}` : ""}.
          </h1>
          <Link
            href="/settings"
            className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
          >
            Settings
          </Link>
        </div>

        {/* ── SECTION 2: Today's digest status ──────────────────────────────── */}
        <TodayCard
          run={todayRun}
          digestHour={config?.digest_hour ?? 7}
          triggering={triggering}
          triggerError={triggerError}
          onTrigger={triggerRun}
        />

        {/* ── SECTION 3: Run history ─────────────────────────────────────────── */}
        <RunHistory
          runs={runs}
          digestHour={config?.digest_hour ?? 7}
        />

        {/* ── SECTION 4: Config summary ─────────────────────────────────────── */}
        {config && <ConfigSummary config={config} />}
      </div>
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

function TodayCard({
  run,
  digestHour,
  triggering,
  triggerError,
  onTrigger,
}: {
  run: PipelineRun | null;
  digestHour: number;
  triggering: boolean;
  triggerError: string;
  onTrigger: () => void;
}) {
  const status = run?.status ?? "none";

  const variants: Record<
    string,
    { dot: string; heading: string; body: React.ReactNode; action?: React.ReactNode }
  > = {
    complete: {
      dot: "bg-green-500",
      heading: "Today's digest is ready",
      body: (
        <p className="text-sm text-gray-500">
          {run?.papers_passed} papers passed &middot; Top score:{" "}
          {run?.top_score ?? "—"}/10
        </p>
      ),
      action: run?.notion_page_url ? (
        <a
          href={run.notion_page_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-4 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-2 rounded-lg"
        >
          View in Notion
        </a>
      ) : null,
    },
    running: {
      dot: "bg-amber-400",
      heading: "Digest is being generated…",
      body: <p className="text-sm text-gray-500">Check back in a few minutes.</p>,
    },
    pending: {
      dot: "bg-gray-400",
      heading: "Today's digest hasn't run yet",
      body: (
        <p className="text-sm text-gray-500">
          Scheduled for {padDigestHour(digestHour)} your time.
        </p>
      ),
      action: (
        <button
          onClick={onTrigger}
          disabled={triggering}
          className="mt-4 border border-indigo-600 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 text-sm font-medium px-5 py-2 rounded-lg"
        >
          {triggering ? "Running…" : "Run now"}
        </button>
      ),
    },
    none: {
      dot: "bg-gray-400",
      heading: "Today's digest hasn't run yet",
      body: (
        <p className="text-sm text-gray-500">
          Scheduled for {padDigestHour(digestHour)} your time.
        </p>
      ),
      action: (
        <button
          onClick={onTrigger}
          disabled={triggering}
          className="mt-4 border border-indigo-600 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 text-sm font-medium px-5 py-2 rounded-lg"
        >
          {triggering ? "Running…" : "Run now"}
        </button>
      ),
    },
    empty: {
      dot: "bg-blue-400",
      heading: "No papers matched today",
      body: (
        <p className="text-sm text-gray-500">
          Try broadening your topics in{" "}
          <Link href="/settings" className="text-indigo-600 hover:underline">
            Settings
          </Link>
          .
        </p>
      ),
    },
    failed: {
      dot: "bg-red-500",
      heading: "Something went wrong today",
      body: (
        <>
          <p className="text-sm text-gray-500">
            We&apos;ll retry automatically tomorrow.
          </p>
          {run?.error_message && (
            <p className="mt-2 text-xs text-red-500 font-mono bg-red-50 rounded px-3 py-2">
              {run.error_message}
            </p>
          )}
        </>
      ),
    },
  };

  const v = variants[status] ?? variants.none;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${v.dot}`} />
        <h2 className="text-base font-semibold text-gray-900">{v.heading}</h2>
      </div>
      {v.body}
      {v.action}
      {triggerError && (
        <p className="mt-2 text-xs text-red-500">{triggerError}</p>
      )}
    </div>
  );
}

function RunHistory({
  runs,
  digestHour,
}: {
  runs: PipelineRun[];
  digestHour: number;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Run history</h2>
      </div>

      {runs.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-gray-500">
            No digests yet. Your first one will arrive at{" "}
            {padDigestHour(digestHour)} tomorrow.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Fetched</th>
                <th className="px-6 py-3">Passed</th>
                <th className="px-6 py-3">Top score</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Notion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {runs.slice(0, 7).map((run) => (
                <tr key={run.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-700 whitespace-nowrap">
                    {formatRunDate(run.run_date)}
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    {run.papers_fetched}
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    {run.papers_passed}
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    {run.top_score != null ? `${run.top_score}/10` : "—"}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${
                        STATUS_PILL[run.status]
                      }`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {run.notion_page_url ? (
                      <a
                        href={run.notion_page_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-500 font-medium"
                      >
                        View →
                      </a>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ConfigSummary({ config }: { config: UserConfig }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Your setup</h2>
        <Link
          href="/settings"
          className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
        >
          Edit settings
        </Link>
      </div>

      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="text-sm text-gray-500 w-36 shrink-0">Your topics</span>
          <div className="flex flex-wrap gap-1.5">
            {config.topics?.length ? (
              config.topics.map((t) => (
                <span
                  key={t}
                  className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full"
                >
                  {t}
                </span>
              ))
            ) : (
              <span className="text-sm text-gray-400">None set</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 w-36 shrink-0">Experience level</span>
          <span className="text-sm text-gray-700">
            {EXPERIENCE_LABELS[config.experience_level] ?? config.experience_level}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 w-36 shrink-0">Notion</span>
          {config.notion_connected ? (
            <span className="text-sm text-green-600 font-medium">
              Connected ✓
            </span>
          ) : (
            <span className="text-sm text-red-500 font-medium">
              Not connected ✗
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
