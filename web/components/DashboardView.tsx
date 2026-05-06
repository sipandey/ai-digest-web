"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";

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
  run_date: string;
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

// ── constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 15_000;
const TERMINAL_STATUSES = new Set<PipelineRun["status"]>(["complete", "failed", "empty"]);

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

const STATUS_STYLES: Record<
  PipelineRun["status"],
  { pill: string; dot: string; label: string }
> = {
  complete: {
    pill: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
    dot: "bg-emerald-500",
    label: "Complete",
  },
  running: {
    pill: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
    dot: "bg-amber-400",
    label: "Running",
  },
  pending: {
    pill: "bg-gray-100 text-gray-500",
    dot: "bg-gray-300",
    label: "Pending",
  },
  failed: {
    pill: "bg-red-100 text-red-600 ring-1 ring-red-200",
    dot: "bg-red-500",
    label: "Failed",
  },
  empty: {
    pill: "bg-sky-100 text-sky-700 ring-1 ring-sky-200",
    dot: "bg-sky-400",
    label: "No matches",
  },
};

// ── skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className: string }) {
  return (
    <div className={`bg-gray-200 rounded-xl animate-pulse ${className}`} />
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function DashboardView() {
  const router = useRouter();

  const [config, setConfig] = useState<UserConfig | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [configRes, runsRes] = await Promise.all([
          fetch("/api/users/config"),
          fetch("/api/users/runs"),
        ]);

        // 404 = onboarding not completed → send to onboarding
        if (configRes.status === 404) {
          router.replace("/onboarding");
          return;
        }

        // 5xx / network errors → show an error state, not a silent redirect
        if (!configRes.ok) {
          setLoadError("Could not load your dashboard. Please refresh the page.");
          return;
        }

        const configData = await configRes.json();

        // No Notion connection yet → send to onboarding
        if (!configData.notion_connected && !configData.config?.notion_connected) {
          router.replace("/onboarding");
          return;
        }

        setConfig(configData.config ?? configData);
        setProfile(configData.profile ?? null);
        setRuns((await runsRes.json()).runs ?? []);
      } catch {
        setLoadError("Could not load your dashboard. Please refresh the page.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  // Auto-refresh while today's run is active (pending or running).
  useEffect(() => {
    const today = todayISO();
    const todayRun = runs.find((r) => r.run_date === today) ?? null;
    if (!todayRun || TERMINAL_STATUSES.has(todayRun.status)) return;

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch("/api/users/runs");
        const data = await res.json();
        setRuns(data.runs ?? []);
      } catch {
        // silently ignore — next tick will retry
      }
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timeout);
  }, [runs]);

  async function triggerRun() {
    setTriggering(true);
    setTriggerError("");
    try {
      const res = await fetch("/api/pipeline/trigger", { method: "POST" });
      if (res.ok) {
        const runsRes = await fetch("/api/users/runs");
        setRuns((await runsRes.json()).runs ?? []);
      } else {
        const data = await res.json();
        if (res.status === 429 && data.retryAfterSeconds) {
          const mins = Math.ceil(data.retryAfterSeconds / 60);
          setTriggerError(
            `Too soon — please wait ${mins} minute${mins !== 1 ? "s" : ""} before running again.`
          );
        } else {
          setTriggerError(data.error ?? "Trigger failed — please try again.");
        }
      }
    } catch {
      setTriggerError("Network error — please try again.");
    } finally {
      setTriggering(false);
    }
  }

  // ── loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f4f8]">
        <div className="max-w-[480px] mx-auto px-4 pt-12 pb-24 space-y-4">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
        <BottomNav active="dashboard" />
      </div>
    );
  }

  // ── error ──────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#f4f4f8] flex flex-col items-center justify-center px-4">
        <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-sm text-center space-y-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[#14141e]">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
          >
            Refresh
          </button>
        </div>
        <BottomNav active="dashboard" />
      </div>
    );
  }

  const today = todayISO();
  const todayRun = runs.find((r) => r.run_date === today) ?? null;
  const userName = profile?.name?.split(" ")[0] ?? null;
  const tz = config?.timezone_offset ?? 0;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f4f4f8]">
      <div className="max-w-[480px] mx-auto px-4 pt-12 pb-24 space-y-4">

        {/* ── Greeting ──────────────────────────────────────────────────── */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">
            AI Digest
          </p>
          <h1 className="text-2xl font-bold text-[#14141e]">
            {greeting(tz)}{userName ? `, ${userName}` : ""}.
          </h1>
        </div>

        {/* ── Today's digest card ───────────────────────────────────────── */}
        <TodayCard
          run={todayRun}
          digestHour={config?.digest_hour ?? 7}
          triggering={triggering}
          triggerError={triggerError}
          onTrigger={triggerRun}
        />

        {/* ── Run history ───────────────────────────────────────────────── */}
        <RunHistory runs={runs} digestHour={config?.digest_hour ?? 7} />

        {/* ── Config summary ────────────────────────────────────────────── */}
        {config && <ConfigSummary config={config} />}
      </div>

      <BottomNav active="dashboard" />
    </div>
  );
}

// ── TodayCard ─────────────────────────────────────────────────────────────────

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

  const runNowBtn = (
    <button
      onClick={onTrigger}
      disabled={triggering}
      className="border border-indigo-400 text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100 disabled:opacity-40 text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
    >
      {triggering ? "Running…" : "Run now"}
    </button>
  );

  type Variant = {
    dot: string;
    heading: string;
    body: React.ReactNode;
    action?: React.ReactNode;
  };

  const variants: Record<string, Variant> = {
    complete: {
      dot: "bg-emerald-500",
      heading: "Today's digest is ready",
      body: (
        <p className="text-sm text-gray-500">
          {run?.papers_passed} papers matched &middot; Top score:{" "}
          {run?.top_score ?? "—"}/10
        </p>
      ),
      action: (
        <div className="mt-5 flex flex-wrap gap-3">
          {run?.notion_page_url && (
            <a
              href={run.notion_page_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              Open in Notion ↗
            </a>
          )}
          {runNowBtn}
        </div>
      ),
    },
    running: {
      dot: "bg-amber-400 animate-pulse",
      heading: "Digest is being generated…",
      body: (
        <p className="text-sm text-gray-500">
          Refreshing automatically every 15 s
          <span className="inline-block animate-pulse">…</span>
        </p>
      ),
    },
    pending: {
      dot: "bg-gray-300 animate-pulse",
      heading: "Digest is queued…",
      body: (
        <p className="text-sm text-gray-500">
          Refreshing automatically every 15 s
          <span className="inline-block animate-pulse">…</span>
        </p>
      ),
    },
    none: {
      dot: "bg-gray-300",
      heading: "Digest hasn't run yet today",
      body: (
        <p className="text-sm text-gray-500">
          Scheduled for {padDigestHour(digestHour)} your time.
        </p>
      ),
      action: <div className="mt-5">{runNowBtn}</div>,
    },
    empty: {
      dot: "bg-sky-400",
      heading: "No papers matched today",
      body: (
        <p className="text-sm text-gray-500">
          Try broadening your topics in{" "}
          <Link href="/settings" className="text-indigo-600 hover:text-indigo-500">
            Settings
          </Link>
          .
        </p>
      ),
      action: <div className="mt-5">{runNowBtn}</div>,
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
            <p className="mt-3 text-xs text-red-600 font-mono bg-red-50 rounded-xl px-3 py-2">
              {run.error_message}
            </p>
          )}
        </>
      ),
      action: <div className="mt-5">{runNowBtn}</div>,
    },
  };

  const v = variants[status] ?? variants.none;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span className={`w-2 h-2 rounded-full shrink-0 ${v.dot}`} />
        <h2 className="text-base font-semibold text-[#14141e]">{v.heading}</h2>
      </div>
      {v.body}
      {v.action}
      {triggerError && (
        <p className="mt-3 text-xs text-red-500">{triggerError}</p>
      )}
    </div>
  );
}

// ── RunHistory ────────────────────────────────────────────────────────────────

function RunHistory({
  runs,
  digestHour,
}: {
  runs: PipelineRun[];
  digestHour: number;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-[#14141e]">Run history</h2>
      </div>

      {runs.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-gray-400">
            Your first digest arrives at {padDigestHour(digestHour)} tomorrow.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {runs.slice(0, 7).map((run) => {
            const s = STATUS_STYLES[run.status];
            return (
              <div key={run.id} className="px-5 py-3.5 flex items-center gap-3">
                {/* Date + meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#14141e] truncate">
                    {formatRunDate(run.run_date)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {run.papers_passed ?? 0} passed
                    {run.top_score != null ? ` · ${run.top_score}/10` : ""}
                  </p>
                </div>

                {/* Status pill */}
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${s.pill}`}>
                  {s.label}
                </span>

                {/* Notion link */}
                {run.notion_page_url ? (
                  <a
                    href={run.notion_page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-500 text-sm shrink-0"
                    aria-label="Open in Notion"
                  >
                    ↗
                  </a>
                ) : (
                  <span className="w-5 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ConfigSummary ─────────────────────────────────────────────────────────────

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: "Complete beginner",
  developer_learning_ai: "Developer learning AI",
  practitioner: "Practitioner",
  ml_engineer: "ML Engineer",
};

function ConfigSummary({ config }: { config: UserConfig }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[#14141e]">Your setup</h2>
        <Link
          href="/settings"
          className="text-xs text-indigo-600 hover:text-indigo-500 font-medium"
        >
          Edit →
        </Link>
      </div>

      <div className="space-y-3.5">
        <div>
          <p className="text-xs text-gray-400 mb-2">Topics</p>
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
              <span className="text-xs text-gray-300">None set</span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">Experience</p>
          <p className="text-xs text-gray-600">
            {EXPERIENCE_LABELS[config.experience_level] ?? config.experience_level}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">Notion</p>
          {config.notion_connected ? (
            <span className="text-xs text-emerald-600 font-medium">Connected ✓</span>
          ) : (
            <span className="text-xs text-red-500 font-medium">Not connected</span>
          )}
        </div>
      </div>
    </div>
  );
}
