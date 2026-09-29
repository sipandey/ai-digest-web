"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import PaperCard, { Paper } from "./PaperCard";
import { getBookmarks, BOOKMARKS_EVENT_NAME } from "@/lib/bookmarks";

export type DigestHistoryItem = {
  run_date: string;
  lens: string;
  top_score: number | null;
};

export type Digest = {
  id: string;
  run_date: string;
  lens: string;
  papers: Paper[];
  top_score: number | null;
  created_at: string;
};

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

const LENS_LABELS: Record<string, string> = {
  builder: "🛠️ Builder Lens",
  founder: "💡 Founder Lens",
  researcher: "🔬 Researcher Lens",
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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DigestReader({
  digest,
  digestHistory,
  selectedDate,
  loadingDigest,
  onSelectDate,
  notionConnected,
  activeRun,
  todayRun,
  onTrigger,
  triggering,
  digestHour = 7,
}: {
  digest: Digest | null;
  digestHistory: DigestHistoryItem[];
  selectedDate: string;
  loadingDigest: boolean;
  onSelectDate: (date: string) => void;
  notionConnected: boolean;
  activeRun?: PipelineRun | null;
  todayRun?: PipelineRun | null;
  onTrigger?: () => void;
  triggering?: boolean;
  digestHour?: number;
}) {
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [onlySaved, setOnlySaved] = useState(false);
  const [minScore, setMinScore] = useState<number | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [feedbackMap, setFeedbackMap] = useState<Record<string, "more" | "less">>({});

  const today = todayISO();
  const papers = digest?.papers ?? [];
  const lens = digest?.lens ?? "builder";
  const activeLensLabel = LENS_LABELS[lens] ?? "🛠️ Builder Lens";

  // Sync saved bookmarks from storage
  useEffect(() => {
    const syncBookmarks = () => {
      const list = getBookmarks();
      setBookmarkedIds(new Set(list.map((p) => p.arxiv_id)));
    };
    syncBookmarks();
    window.addEventListener(BOOKMARKS_EVENT_NAME, syncBookmarks);
    return () => window.removeEventListener(BOOKMARKS_EVENT_NAME, syncBookmarks);
  }, []);

  // Fetch user feedback ratings on load
  useEffect(() => {
    async function loadFeedback() {
      try {
        const res = await fetch("/api/users/feedback");
        if (res.ok) {
          const data = await res.json();
          setFeedbackMap(data.feedback ?? {});
        }
      } catch {
        // silently ignore
      }
    }
    loadFeedback();
  }, []);

  async function handleRate(arxivId: string, rating: "more" | "less") {
    const current = feedbackMap[arxivId];
    if (current === rating) {
      // Toggle off / reset
      setFeedbackMap((prev) => {
        const next = { ...prev };
        delete next[arxivId];
        return next;
      });
      try {
        await fetch(`/api/users/feedback?arxiv_id=${encodeURIComponent(arxivId)}`, {
          method: "DELETE",
        });
      } catch {
        // silently ignore
      }
    } else {
      // Set new rating
      setFeedbackMap((prev) => ({ ...prev, [arxivId]: rating }));
      const paper = papers.find((p) => p.arxiv_id === arxivId);
      try {
        await fetch("/api/users/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            arxiv_id: arxivId,
            rating,
            paper_title: paper?.title,
            paper_categories: paper?.category ? [paper.category] : [],
          }),
        });
      } catch {
        // silently ignore
      }
    }
  }

  // Extract unique categories from papers
  const categories = useMemo(() => {
    const set = new Set<string>();
    papers.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [papers]);

  const savedInDigestCount = useMemo(() => {
    return papers.filter((p) => bookmarkedIds.has(p.arxiv_id)).length;
  }, [papers, bookmarkedIds]);

  const mustReadCount = useMemo(() => {
    return papers.filter((p) => (p.score ?? 0) >= 8.0).length;
  }, [papers]);

  // Filter papers by category, bookmark status, score, and search query
  const filteredPapers = useMemo(() => {
    let result = papers;
    if (onlySaved) {
      result = result.filter((p) => bookmarkedIds.has(p.arxiv_id));
    }
    if (minScore !== null) {
      result = result.filter((p) => (p.score ?? 0) >= minScore);
    }
    if (selectedCat) {
      result = result.filter((p) => p.category === selectedCat);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) => {
        return (
          p.title?.toLowerCase().includes(q) ||
          p.abstract?.toLowerCase().includes(q) ||
          p.builder_takeaway?.toLowerCase().includes(q) ||
          p.problem?.toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [papers, onlySaved, minScore, selectedCat, search, bookmarkedIds]);

  const hasActiveFilters = onlySaved || minScore !== null || selectedCat !== null || search.trim() !== "";

  const clearAllFilters = () => {
    setSearch("");
    setSelectedCat(null);
    setOnlySaved(false);
    setMinScore(null);
  };

  return (
    <div className="space-y-4">
      {/* ── Date History Picker Bar ────────────────────────────────────────── */}
      {digestHistory.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {digestHistory.map((h) => {
            const isSelected = h.run_date === selectedDate;
            const isToday = h.run_date === today;
            return (
              <button
                key={h.run_date}
                onClick={() => onSelectDate(h.run_date)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium shrink-0 transition-colors ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                {isToday ? "Today" : formatRunDate(h.run_date)}
                {h.top_score && (
                  <span
                    className={`ml-1.5 text-[10px] ${
                      isSelected ? "text-indigo-200" : "text-gray-400"
                    }`}
                  >
                    {Math.round(h.top_score * 10) / 10}★
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Reader Card ────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
        {/* Header Bar */}
        <div className="p-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-md border border-indigo-200">
                {activeLensLabel}
              </span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs font-medium text-gray-500">
                {formatRunDate(selectedDate)}
              </span>
            </div>
            <h2 className="text-lg font-bold text-[#14141e]">Daily Research Digest</h2>
          </div>

          <div className="flex items-center gap-2">
            {activeRun?.notion_page_url && (
              <a
                href={activeRun.notion_page_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-gray-600 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 rounded-xl px-3 py-1.5 bg-gray-50/50 transition-colors flex items-center gap-1.5"
              >
                <span>Notion</span>
                <span>↗</span>
              </a>
            )}
          </div>
        </div>

        {/* Search & Precision Filter Bar */}
        {papers.length > 0 && (
          <div className="px-5 py-3.5 bg-[#fbfbfe] border-b border-gray-100 space-y-3">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search papers by keyword, problem, or takeaway…"
                className="w-full bg-white border border-gray-200 focus:border-indigo-400 rounded-xl px-3.5 py-2 text-xs text-[#14141e] placeholder:text-gray-400 focus:outline-none transition-colors pr-8"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-2 text-xs text-gray-400 hover:text-gray-600"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Pills: All / Saved / Must-Read / Categories */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mr-1">
                Filter:
              </span>
              <button
                type="button"
                onClick={() => {
                  setOnlySaved(false);
                  setMinScore(null);
                  setSelectedCat(null);
                }}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  !onlySaved && minScore === null && selectedCat === null
                    ? "bg-indigo-600 text-white font-medium"
                    : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                All ({papers.length})
              </button>

              <button
                type="button"
                onClick={() => setOnlySaved(!onlySaved)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                  onlySaved
                    ? "bg-amber-500 text-white font-medium shadow-xs"
                    : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                <span>⭐</span>
                <span>Saved ({savedInDigestCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setMinScore(minScore === 8.0 ? null : 8.0)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                  minScore === 8.0
                    ? "bg-emerald-600 text-white font-medium shadow-xs"
                    : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                <span>🔥</span>
                <span>Must-Read 8.0+ ({mustReadCount})</span>
              </button>

              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedCat(selectedCat === c ? null : c)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                    selectedCat === c
                      ? "bg-indigo-600 text-white font-medium"
                      : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Results Counter & Reset */}
            <div className="flex items-center justify-between text-xs text-gray-500 pt-0.5">
              <span>
                Showing <strong className="text-gray-800">{filteredPapers.length}</strong> of {papers.length} papers
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
                >
                  Reset all filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5">
          {loadingDigest ? (
            <div className="space-y-4 py-8 text-center">
              <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
              <p className="text-xs text-gray-400">Loading digest…</p>
            </div>
          ) : todayRun?.status === "running" || todayRun?.status === "pending" ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto animate-pulse">
                ⏳
              </div>
              <h3 className="text-sm font-semibold text-[#14141e]">Your digest is generating</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Scanning the latest arXiv papers and evaluating them against your research profile. Refreshing automatically…
              </p>
            </div>
          ) : filteredPapers.length > 0 ? (
            <div className="space-y-5">
              {filteredPapers.map((paper, idx) => (
                <PaperCard
                  key={paper.arxiv_id || idx}
                  paper={paper}
                  lens={lens}
                  rank={idx + 1}
                  currentRating={paper.arxiv_id ? feedbackMap[paper.arxiv_id] : null}
                  onRate={handleRate}
                />
              ))}
            </div>
          ) : papers.length > 0 && filteredPapers.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-gray-600 font-medium">
                {onlySaved
                  ? "No saved papers match the active filters."
                  : "No papers matched your search or category filters."}
              </p>
              {onlySaved && (
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Click the ☆ Save button on any paper card to bookmark it for quick offline reference.
                </p>
              )}
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs text-indigo-600 hover:underline font-semibold"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="py-12 text-center space-y-4">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto text-xl">
                📄
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-[#14141e]">No digest available for this date</h3>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  Your daily digest runs every morning at {padDigestHour(digestHour)}. You can also trigger an immediate run.
                </p>
              </div>
              {onTrigger && (
                <button
                  type="button"
                  onClick={onTrigger}
                  disabled={triggering}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-40"
                >
                  {triggering ? "Generating…" : "Generate today's digest"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Subtle Notion Banner */}
      {!notionConnected && (
        <div className="p-4 bg-white border border-gray-200 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5 text-gray-600">
            <span className="text-base">💡</span>
            <span>Prefer reading in Notion? Connect your Notion workspace in Settings anytime.</span>
          </div>
          <Link href="/settings" className="font-semibold text-indigo-600 hover:underline shrink-0 ml-3">
            Connect →
          </Link>
        </div>
      )}
    </div>
  );
}

export default DigestReader;
