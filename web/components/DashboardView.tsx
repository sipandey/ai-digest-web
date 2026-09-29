"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DigestReader, {
  Digest,
  DigestHistoryItem,
  PipelineRun,
} from "./digest/DigestReader";
import {
  TodayStatusCard,
  RunHistory,
  ConfigSummary,
  PrecisionCommandStrip,
  UserConfig,
} from "./dashboard/SidebarCards";
import { BottomNav } from "./BottomNav";

export type UserProfile = {
  name?: string;
  email?: string;
};

const TERMINAL_STATUSES = new Set(["complete", "failed", "empty"]);
const POLL_INTERVAL_MS = 4000;

function greeting(tzOffsetHours: number): string {
  const utcNow = new Date();
  const localHour = (utcNow.getUTCHours() + tzOffsetHours + 24) % 24;
  if (localHour < 12) return "Good morning";
  if (localHour < 17) return "Good afternoon";
  return "Good evening";
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function padDigestHour(h: number): string {
  return String(h).padStart(2, "0") + ":00";
}

export function DashboardView() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [config, setConfig] = useState<UserConfig | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [digestHistory, setDigestHistory] = useState<DigestHistoryItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [loadingDigest, setLoadingDigest] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [configRes, runsRes, digestRes] = await Promise.all([
          fetch("/api/users/config"),
          fetch("/api/users/runs"),
          fetch("/api/users/digests"),
        ]);

        if (configRes.status === 401 || runsRes.status === 401) {
          router.replace("/sign-in");
          return;
        }

        const configData = await configRes.json();
        setConfig(configData.config ?? configData);
        setProfile(configData.profile ?? null);

        const runsData = await runsRes.json();
        setRuns(runsData.runs ?? []);

        if (digestRes.ok) {
          const digestData = await digestRes.json();
          setDigest(digestData.digest ?? null);
          setDigestHistory(digestData.history ?? []);
          if (digestData.digest?.run_date) {
            setSelectedDate(digestData.digest.run_date);
          }
        }
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
        const [runsRes, digestRes] = await Promise.all([
          fetch("/api/users/runs"),
          fetch("/api/users/digests"),
        ]);
        const runsData = await runsRes.json();
        setRuns(runsData.runs ?? []);
        if (digestRes.ok) {
          const digestData = await digestRes.json();
          setDigest(digestData.digest ?? null);
          setDigestHistory(digestData.history ?? []);
        }
      } catch {
        // silently ignore — next tick will retry
      }
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timeout);
  }, [runs]);

  async function selectDigestDate(date: string) {
    if (date === selectedDate && digest) return;
    setSelectedDate(date);
    setLoadingDigest(true);
    try {
      const res = await fetch(`/api/users/digests?date=${date}`);
      if (res.ok) {
        const data = await res.json();
        setDigest(data.digest ?? null);
      }
    } catch {
      // silently ignore
    } finally {
      setLoadingDigest(false);
    }
  }

  async function triggerRun() {
    if (triggering) return;
    setTriggering(true);
    setTriggerError(null);

    try {
      const res = await fetch("/api/pipeline/trigger", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setTriggerError(data.error ?? "Failed to trigger pipeline");
        return;
      }

      const runsRes = await fetch("/api/users/runs");
      if (runsRes.ok) {
        const runsData = await runsRes.json();
        setRuns(runsData.runs ?? []);
      }
    } catch {
      setTriggerError("Network error. Please try again.");
    } finally {
      setTriggering(false);
    }
  }

  const manualRunsToday = runs.filter(
    (r) => r.run_date === todayISO() && r.status !== "failed"
  ).length;
  const dailyLimitReached = manualRunsToday >= 1;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f4f8] flex items-center justify-center p-4">
        <div className="space-y-3 text-center">
          <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-gray-500 font-medium">Loading your briefing…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#f4f4f8] flex items-center justify-center p-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-sm w-full text-center space-y-3 shadow-xs">
          <p className="text-sm text-red-600 font-medium">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-indigo-500 transition-colors"
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
  const activeRun = runs.find((r) => r.run_date === selectedDate) ?? null;
  const userName = profile?.name?.split(" ")[0] ?? null;
  const tz = Number(config?.timezone_offset ?? 0);
  const isRunning = todayRun?.status === "running" || todayRun?.status === "pending" || triggering;

  return (
    <div className="min-h-screen bg-[#f4f4f8]">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-6 sm:pt-10 pb-24">
        {/* ── High Confidence Primary Action Header ────────────────────── */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                AI Digest · Executive Reader
              </span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500 font-medium">
                Scheduled daily at {padDigestHour(config?.digest_hour ?? 7)}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14141e] tracking-tight">
              {greeting(tz)}{userName ? `, ${userName}` : ""}.
            </h1>
          </div>

          {/* Consolidated Single Run Action */}
          <div className="flex items-center gap-3">
            {isRunning ? (
              <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-xl text-xs font-semibold shadow-xs">
                <span className="w-3 h-3 border-2 border-amber-400 border-t-amber-700 rounded-full animate-spin" />
                <span>Pipeline running… scanning arXiv</span>
              </div>
            ) : dailyLimitReached ? (
              <div className="text-right">
                <button
                  disabled
                  className="bg-gray-100 text-gray-400 border border-gray-200 text-xs font-semibold px-4 py-2.5 rounded-xl cursor-not-allowed"
                >
                  ✓ Run completed today
                </button>
                <p className="text-[10px] text-gray-400 mt-1">Manual limit: 1/day</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={triggerRun}
                disabled={triggering}
                className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow-xs flex items-center gap-2 hover:shadow-indigo-200"
              >
                <span>⚡</span>
                <span>Generate today&apos;s digest</span>
              </button>
            )}
          </div>
        </header>

        {/* ── Value Realization Banner ─────────────────────────────────── */}
        {digest && digest.papers.length > 0 && (
          <section
            aria-label="Daily Briefing Value Summary"
            className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-950 text-white rounded-2xl p-4 sm:p-5 shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-white/10 text-indigo-200 px-2 py-0.5 rounded">
                  Curated Intelligence
                </span>
                <span className="text-xs text-indigo-200 font-medium">
                  {activeRun?.papers_fetched
                    ? `${activeRun.papers_fetched} arXiv papers scanned`
                    : "Latest arXiv submission batch"}
                </span>
              </div>
              <p className="text-sm sm:text-base font-semibold text-white">
                {digest.papers.length} breakthrough papers selected for your{" "}
                <span className="text-indigo-200 font-bold">{config?.digest_lens ?? "builder"}</span> focus
              </p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="bg-white/10 rounded-xl px-3.5 py-1.5 text-right">
                <div className="text-xl sm:text-2xl font-black text-amber-300">
                  {digest.top_score ? `${Math.round(digest.top_score * 10) / 10}★` : "—"}
                </div>
                <div className="text-[10px] text-indigo-200 uppercase font-bold tracking-wider">Top Match</div>
              </div>
            </div>
          </section>
        )}

        {/* ── Main Two-Column Grid Layout ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Main Digest Reader Feed */}
          <main className="lg:col-span-2 space-y-6">
            <DigestReader
              digest={digest}
              digestHistory={digestHistory}
              selectedDate={selectedDate}
              loadingDigest={loadingDigest}
              onSelectDate={selectDigestDate}
              notionConnected={config?.notion_connected ?? false}
              activeRun={activeRun}
              todayRun={todayRun}
              onTrigger={triggerRun}
              triggering={triggering}
              digestHour={config?.digest_hour ?? 7}
            />
          </main>

          {/* ── Sticky Precision Command Strip & Desktop Sidebar ────────── */}
          <aside className="space-y-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1 scrollbar-none">
            {/* Quick Outline & Jump Navigator */}
            <PrecisionCommandStrip papers={digest?.papers ?? []} />

            {/* Mobile Collapsible Switch for History & Config */}
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
                className="w-full text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl px-4 py-2.5 flex items-center justify-between transition-colors"
              >
                <span>Setup & Run History</span>
                <span>{mobileSidebarOpen ? "▲" : "▼"}</span>
              </button>
            </div>

            <div className={`${mobileSidebarOpen ? "block" : "hidden"} lg:block space-y-5`}>
              <TodayStatusCard
                run={todayRun}
                digestHour={config?.digest_hour ?? 7}
                triggerError={triggerError ?? undefined}
              />

              <RunHistory runs={runs} />

              {config && <ConfigSummary config={config} />}
            </div>
          </aside>
        </div>
      </div>

      <BottomNav active="dashboard" />
    </div>
  );
}

export default DashboardView;
