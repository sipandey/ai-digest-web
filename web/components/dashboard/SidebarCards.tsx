"use client";

import Link from "next/link";

export type PipelineRun = {
  id: string;
  run_date: string;
  status: "pending" | "running" | "complete" | "failed" | "empty";
  papers_fetched: number;
  papers_passed: number;
  top_score: number | null;
  notion_page_url: string | null;
  error_message: string | null;
};

export type UserConfig = {
  notion_connected: boolean;
  topics: string[];
  experience_level: string;
  digest_lens?: string;
  digest_hour: number;
  timezone_offset: number;
};

const LENS_LABELS: Record<string, string> = {
  builder: "🛠️ Builder Lens",
  founder: "💡 Founder Lens",
  researcher: "🔬 Researcher Lens",
};

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: "Complete beginner",
  developer_learning_ai: "Developer learning AI",
  practitioner: "Practitioner",
  ml_engineer: "ML Engineer",
};

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

// ── TodayStatusCard ───────────────────────────────────────────────────────────

export function TodayStatusCard({
  run,
  digestHour,
  triggering,
  dailyLimitReached,
  onTrigger,
}: {
  run: PipelineRun | null;
  digestHour: number;
  triggering: boolean;
  dailyLimitReached: boolean;
  onTrigger: () => void;
}) {
  const status = run?.status ?? "none";

  const runNowBtn = dailyLimitReached ? (
    <p className="text-xs text-amber-600 font-medium">Daily limit reached — resets tomorrow.</p>
  ) : (
    <button
      onClick={onTrigger}
      disabled={triggering}
      className="border border-indigo-400 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
    >
      {triggering ? "Running…" : "Run now"}
    </button>
  );

  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#14141e]">Today&apos;s Run</h2>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${style.pill}`}>
          {style.label}
        </span>
      </div>

      <div className="space-y-2 mb-4 text-xs text-gray-500">
        {status === "complete" ? (
          <p>{run?.papers_passed} papers passed &middot; Top score: {run?.top_score ?? "—"}/10</p>
        ) : status === "running" ? (
          <p className="animate-pulse">Generating your digest now…</p>
        ) : status === "empty" ? (
          <p>No papers crossed the threshold today.</p>
        ) : (
          <p>Scheduled daily at {padDigestHour(digestHour)} your time.</p>
        )}
      </div>

      <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
        {runNowBtn}
        {run?.notion_page_url && (
          <a
            href={run.notion_page_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            Notion page ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ── RunHistory ────────────────────────────────────────────────────────────────

export function RunHistory({ runs }: { runs: PipelineRun[] }) {
  if (runs.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
      <div className="px-5 py-3.5 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-[#14141e]">Recent Runs</h2>
      </div>

      <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
        {runs.slice(0, 7).map((run) => {
          const style = STATUS_STYLES[run.status] ?? STATUS_STYLES.pending;
          return (
            <div key={run.id} className="px-5 py-3 flex items-center justify-between text-xs">
              <div>
                <p className="font-medium text-[#14141e]">{formatRunDate(run.run_date)}</p>
                <p className="text-gray-400 text-[11px]">
                  {run.status === "complete"
                    ? `${run.papers_passed} papers · ${run.top_score ?? "—"}/10`
                    : style.label}
                </p>
              </div>

              {run.notion_page_url ? (
                <a
                  href={run.notion_page_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline font-medium"
                >
                  Notion ↗
                </a>
              ) : (
                <span className={`px-2 py-0.5 rounded-full font-medium text-[10px] ${style.pill}`}>
                  {style.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ConfigSummary ─────────────────────────────────────────────────────────────

export function ConfigSummary({ config }: { config: UserConfig }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[#14141e]">Your setup</h2>
        <Link href="/settings" className="text-xs text-indigo-600 hover:text-indigo-500 font-medium">
          Edit →
        </Link>
      </div>

      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">Lens</p>
          <p className="text-xs font-semibold text-indigo-700">
            {config.digest_lens ? (LENS_LABELS[config.digest_lens] ?? config.digest_lens) : "🛠️ Builder Lens"}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-2">Topics</p>
          <div className="flex flex-wrap gap-1.5">
            {config.topics?.length ? (
              config.topics.map((t) => (
                <span key={t} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full">
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
            <span className="text-xs text-gray-400">Not connected</span>
          )}
        </div>
      </div>
    </div>
  );
}
