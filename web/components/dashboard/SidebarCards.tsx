"use client";

import Link from "next/link";
import { Paper } from "../digest/PaperCard";

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
  PipelineRun["status"] | "none",
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
  none: {
    pill: "bg-gray-100 text-gray-500",
    dot: "bg-gray-300",
    label: "Not run yet",
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

// ── PrecisionCommandStrip (Sticky Desktop Navigator) ──────────────────────────

export function PrecisionCommandStrip({
  papers,
}: {
  papers: Paper[];
}) {
  if (!papers || papers.length === 0) return null;

  const mustReadCount = papers.filter((p) => p.score >= 8.0).length;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
        <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
          <span>⚡</span>
          <span>Briefing Outline</span>
        </h2>
        <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
          {papers.length} papers
        </span>
      </div>

      {mustReadCount > 0 && (
        <div className="text-[11px] text-emerald-800 bg-emerald-50/80 border border-emerald-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
          <span className="font-medium">🔥 Must-Reads (8.0+):</span>
          <span className="font-bold">{mustReadCount}</span>
        </div>
      )}

      {/* Clickable Mini-Jump Paper Links */}
      <div className="space-y-1 max-h-56 overflow-y-auto pr-1 text-xs">
        {papers.map((p, idx) => (
          <a
            key={p.arxiv_id || idx}
            href={`#paper-${p.arxiv_id}`}
            className="block p-1.5 rounded-lg hover:bg-indigo-50 text-gray-700 hover:text-indigo-700 transition-colors group"
          >
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] text-gray-400 group-hover:text-indigo-500 font-bold shrink-0">
                #{idx + 1}
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                  p.score >= 8.5
                    ? "bg-emerald-100 text-emerald-800"
                    : p.score >= 7.5
                    ? "bg-indigo-50 text-indigo-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {Math.round(p.score * 10) / 10}★
              </span>
              <span className="truncate font-medium text-gray-800 group-hover:text-indigo-900">
                {p.title}
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── TodayStatusCard ───────────────────────────────────────────────────────────

export function TodayStatusCard({
  run,
  digestHour,
  triggerError,
}: {
  run: PipelineRun | null;
  digestHour: number;
  triggering?: boolean;
  dailyLimitReached?: boolean;
  onTrigger?: () => void;
  triggerError?: string;
}) {
  const status = run?.status ?? "none";
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#14141e]">Today&apos;s Run Status</h2>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${style.pill}`}>
          {style.label}
        </span>
      </div>

      <div className="space-y-1.5 mb-3 text-xs text-gray-500">
        {status === "complete" ? (
          <div>
            <p className="font-semibold text-gray-800">
              {run?.papers_passed} papers curated
              {run?.papers_fetched ? ` from ${run.papers_fetched} scanned` : ""}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Top match score: <strong className="text-indigo-600">{run?.top_score ?? "—"}/10</strong>
            </p>
          </div>
        ) : status === "running" ? (
          <p className="animate-pulse text-amber-700 font-medium">
            Generating your briefing… scanning arXiv feed and running LLM evaluation.
          </p>
        ) : status === "empty" ? (
          <p>No arXiv papers exceeded your match threshold today.</p>
        ) : (
          <p>Automated digest runs daily at {padDigestHour(digestHour)} your local time.</p>
        )}
      </div>

      {run?.notion_page_url && (
        <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">Export:</span>
          <a
            href={run.notion_page_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 flex items-center gap-1"
          >
            <span>Open in Notion</span>
            <span>↗</span>
          </a>
        </div>
      )}

      {triggerError && (
        <p className="mt-2 text-xs text-red-500">{triggerError}</p>
      )}
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

      <div className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
        {runs.slice(0, 7).map((run) => {
          const style = STATUS_STYLES[run.status] ?? STATUS_STYLES.pending;
          return (
            <div key={run.id} className="px-5 py-2.5 flex items-center justify-between text-xs">
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
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="text-sm font-semibold text-[#14141e]">Your Setup</h2>
        <Link href="/settings" className="text-xs text-indigo-600 hover:text-indigo-500 font-medium">
          Edit →
        </Link>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">Lens</p>
          <p className="text-xs font-semibold text-indigo-700">
            {config.digest_lens ? (LENS_LABELS[config.digest_lens] ?? config.digest_lens) : "🛠️ Builder Lens"}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-1.5">Topics</p>
          <div className="flex flex-wrap gap-1.5">
            {config.topics?.length ? (
              config.topics.map((t) => (
                <span key={t} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full font-medium">
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
