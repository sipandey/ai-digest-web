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

// ── bottom nav ────────────────────────────────────────────────────────────────

function BottomNav({ active }: { active: "dashboard" | "settings" }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 h-16 bg-white/95 backdrop-blur border-t border-gray-200 flex">
      <Link
        href="/dashboard"
        className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
          active === "dashboard" ? "text-indigo-600" : "text-gray-400 hover:text-gray-600"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
          <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" />
        </svg>
        <span className="text-[10px] font-medium">Today</span>
      </Link>
      <Link
        href="/settings"
        className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
          active === "settings" ? "text-indigo-600" : "text-gray-400 hover:text-gray-600"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" />
        </svg>
        <span className="text-[10px] font-medium">Settings</span>
      </Link>
    </nav>
  );
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
        setTriggerError(data.error ?? "Trigger failed — please try again.");
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
