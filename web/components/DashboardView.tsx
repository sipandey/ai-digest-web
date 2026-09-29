"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import DigestReader, { Digest, DigestHistoryItem } from "./digest/DigestReader";
import {
  TodayStatusCard,
  RunHistory,
  ConfigSummary,
} from "./dashboard/SidebarCards";

// ── types ─────────────────────────────────────────────────────────────────────

type UserConfig = {
  notion_connected: boolean;
  topics: string[];
  experience_level: string;
  digest_lens?: string;
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

// ── skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className: string }) {
  return <div className={`bg-gray-200 rounded-xl animate-pulse ${className}`} />;
}

// ── main component ────────────────────────────────────────────────────────────

export default function DashboardView() {
  const router = useRouter();

  const [config, setConfig] = useState<UserConfig | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [digestHistory, setDigestHistory] = useState<DigestHistoryItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [loadingDigest, setLoadingDigest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState("");
  const [dailyLimitReached, setDailyLimitReached] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [configRes, runsRes, digestRes] = await Promise.all([
          fetch("/api/users/config"),
          fetch("/api/users/runs"),
          fetch("/api/users/digests"),
        ]);

        if (configRes.status === 404) {
          router.replace("/onboarding");
          return;
        }

        if (!configRes.ok) {
          setLoadError("Could not load your dashboard. Please refresh the page.");
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
    setTriggering(true);
    setTriggerError("");
    try {
      const res = await fetch("/api/pipeline/trigger", { method: "POST" });
      if (res.ok) {
        const [runsRes, digestRes] = await Promise.all([
          fetch("/api/users/runs"),
          fetch("/api/users/digests"),
        ]);
        setRuns((await runsRes.json()).runs ?? []);
        if (digestRes.ok) {
          const digestData = await digestRes.json();
          setDigest(digestData.digest ?? null);
          setDigestHistory(digestData.history ?? []);
          if (digestData.digest?.run_date) {
            setSelectedDate(digestData.digest.run_date);
          }
        }
      } else {
        const data = await res.json();
        if (data.dailyLimitReached) {
          setDailyLimitReached(true);
          setTriggerError(data.error ?? "Daily run limit reached.");
        } else if (res.status === 429 && data.retryAfterSeconds) {
          const mins = Math.ceil(data.retryAfterSeconds / 60);
          setTriggerError(
            `Too soon — please wait ${mins} minute${mins !== 1 ? "s" : ""} before running again.`
          );
        } else {
          setTriggerError(data.error ?? "Trigger failed — please try again.");
        }
      }
    } catch {
      setTriggerError("Network error — please check your connection.");
    } finally {
      setTriggering(false);
    }
  }

  // ── loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f4f8]">
        <div className="max-w-5xl mx-auto px-4 pt-12 pb-24 space-y-4">
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
  const activeRun = runs.find((r) => r.run_date === selectedDate) ?? null;
  const userName = profile?.name?.split(" ")[0] ?? null;
  const tz = Number(config?.timezone_offset ?? 0);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f4f4f8]">
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-24">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">
              AI Digest · Web Reader
            </p>
            <h1 className="text-2xl font-bold text-[#14141e]">
              {greeting(tz)}{userName ? `, ${userName}` : ""}.
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={triggerRun}
              disabled={triggering || dailyLimitReached}
              className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all shadow-xs flex items-center gap-2"
            >
              {triggering ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating…
                </>
              ) : (
                <>⚡ Run now</>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Digest Reader */}
          <div className="lg:col-span-2 space-y-6">
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
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            <TodayStatusCard
              run={todayRun}
              digestHour={config?.digest_hour ?? 7}
              triggering={triggering}
              triggerError={triggerError}
              dailyLimitReached={dailyLimitReached}
              onTrigger={triggerRun}
            />

            <RunHistory runs={runs} />

            {config && <ConfigSummary config={config} />}
          </div>
        </div>
      </div>

      <BottomNav active="dashboard" />
    </div>
  );
}
