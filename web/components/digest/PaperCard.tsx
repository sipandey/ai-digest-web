"use client";

import { useState, useEffect } from "react";
import { isBookmarked, toggleBookmark, BOOKMARKS_EVENT_NAME } from "@/lib/bookmarks";

export type Paper = {
  arxiv_id: string;
  title: string;
  abstract?: string;
  authors?: string;
  category?: string;
  published_date?: string;
  matched_group?: string;
  score: number;
  score_breakdown?: Record<string, number>;
  problem?: string;
  approach?: string;
  results?: string;
  builder_takeaway?: string;
  learning_path?: string;
  pdf_url?: string;
};

export function PaperCard({
  paper,
  lens,
  rank,
  currentRating,
  onRate,
}: {
  paper: Paper;
  lens: string;
  rank: number;
  currentRating?: "more" | "less" | null;
  onRate?: (arxivId: string, rating: "more" | "less") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const score = Math.round(paper.score * 10) / 10;

  // Sync bookmark state on mount & upon global bookmark events
  useEffect(() => {
    if (!paper.arxiv_id) return;
    setBookmarked(isBookmarked(paper.arxiv_id));

    const handleSync = () => {
      setBookmarked(isBookmarked(paper.arxiv_id));
    };

    window.addEventListener(BOOKMARKS_EVENT_NAME, handleSync);
    return () => window.removeEventListener(BOOKMARKS_EVENT_NAME, handleSync);
  }, [paper.arxiv_id]);

  const handleBookmarkToggle = () => {
    const nextState = toggleBookmark({
      arxiv_id: paper.arxiv_id,
      title: paper.title,
      category: paper.category,
      score: paper.score,
      builder_takeaway: paper.builder_takeaway,
      pdf_url: paper.pdf_url,
    });
    setBookmarked(nextState);
  };

  const handleCopyTakeaway = async () => {
    const takeaway = paper.builder_takeaway || paper.problem || paper.abstract || "See paper for full details.";
    const textToCopy = `📄 ${paper.title} (${score}/10)\n🎯 Takeaway: ${takeaway}\n🔗 https://arxiv.org/abs/${paper.arxiv_id}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
      setCopied(false);
    }
  };

  const handleRateWithFeedback = (rating: "more" | "less") => {
    if (!onRate) return;
    const isClearing = currentRating === rating;
    onRate(paper.arxiv_id, rating);
    const message = isClearing
      ? "Feedback cleared"
      : rating === "more"
      ? "Preference saved: tuning model"
      : "Preference saved: deprioritizing";
    setFeedbackToast(message);
    setTimeout(() => setFeedbackToast(null), 2200);
  };

  return (
    <div
      id={`paper-${paper.arxiv_id}`}
      className="bg-white border border-gray-200 hover:border-gray-300 rounded-2xl p-5 shadow-xs transition-all scroll-mt-24"
    >
      {/* Top Meta & Action Bar */}
      <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-gray-500 bg-gray-100 rounded-md px-2 py-0.5 font-mono">
            #{rank}
          </span>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
              score >= 8.5
                ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300/60"
                : score >= 7.5
                ? "bg-indigo-50 text-indigo-700"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {score}/10
          </span>
          {paper.category && (
            <span className="text-xs bg-gray-100 text-gray-600 font-mono px-2 py-0.5 rounded-md">
              {paper.category}
            </span>
          )}
          {paper.published_date && (
            <span className="text-xs text-gray-400">
              {paper.published_date}
            </span>
          )}
        </div>

        {/* Quick Actions: Copy Takeaway, Star / Bookmark, PDF Link */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={handleCopyTakeaway}
            title="Copy takeaway summary to clipboard"
            className="text-xs px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200"
          >
            <span>{copied ? "✓" : "📋"}</span>
            <span className="hidden sm:inline">{copied ? "Copied!" : "Copy"}</span>
          </button>

          <button
            type="button"
            onClick={handleBookmarkToggle}
            title={bookmarked ? "Remove from saved papers" : "Save paper to library"}
            aria-label={bookmarked ? "Remove bookmark" : "Save paper"}
            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
              bookmarked
                ? "bg-amber-100 text-amber-900 border border-amber-300 font-semibold"
                : "bg-gray-50 hover:bg-amber-50/70 text-gray-600 hover:text-amber-800 border border-gray-200"
            }`}
          >
            <span className={bookmarked ? "text-amber-600" : "text-gray-400"}>
              {bookmarked ? "★" : "☆"}
            </span>
            <span className="hidden sm:inline">{bookmarked ? "Saved" : "Save"}</span>
          </button>

          <a
            href={paper.pdf_url || `https://arxiv.org/pdf/${paper.arxiv_id}.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-600 hover:text-indigo-500 font-medium shrink-0 flex items-center gap-1 bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg transition-colors"
          >
            <span>PDF</span>
            <span>↗</span>
          </a>
        </div>
      </div>

      {/* Paper Title */}
      <h3 className="text-base font-bold text-[#14141e] leading-snug mb-1.5">
        <a
          href={`https://arxiv.org/abs/${paper.arxiv_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-indigo-600 transition-colors"
        >
          {paper.title}
        </a>
      </h3>

      {/* Authors */}
      {paper.authors && (
        <p className="text-xs text-gray-500 mb-3.5 line-clamp-1">
          {paper.authors}
        </p>
      )}

      {/* Lens Takeaway Spotlight Banner */}
      <div className="bg-gradient-to-r from-indigo-50/90 via-indigo-50/40 to-transparent border-l-4 border-indigo-500 rounded-r-xl p-3.5 mb-3 space-y-2">
        {lens === "founder" ? (
          <>
            {paper.builder_takeaway && (
              <div>
                <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🎯</span>
                  <span>Product Opportunity</span>
                </p>
                <p className="text-xs text-indigo-950 font-medium leading-relaxed mt-0.5">{paper.builder_takeaway}</p>
              </div>
            )}
            {paper.learning_path && (
              <div>
                <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span>💡</span>
                  <span>Market Signal</span>
                </p>
                <p className="text-xs text-indigo-900 leading-relaxed mt-0.5">{paper.learning_path}</p>
              </div>
            )}
          </>
        ) : lens === "researcher" ? (
          <>
            {paper.builder_takeaway && (
              <div>
                <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🧪</span>
                  <span>Theoretical Insight</span>
                </p>
                <p className="text-xs text-indigo-950 font-medium leading-relaxed mt-0.5">{paper.builder_takeaway}</p>
              </div>
            )}
            {paper.learning_path && (
              <div>
                <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📖</span>
                  <span>Prerequisites & Foundations</span>
                </p>
                <p className="text-xs text-indigo-900 leading-relaxed mt-0.5">{paper.learning_path}</p>
              </div>
            )}
          </>
        ) : (
          <>
            {paper.builder_takeaway && (
              <div>
                <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🏗️</span>
                  <span>Builder Takeaway</span>
                </p>
                <p className="text-xs text-indigo-950 font-medium leading-relaxed mt-0.5">{paper.builder_takeaway}</p>
              </div>
            )}
            {paper.learning_path && (
              <div>
                <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📚</span>
                  <span>Before Reading</span>
                </p>
                <p className="text-xs text-indigo-900 leading-relaxed mt-0.5">{paper.learning_path}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Action Row: Expand Toggle & Feedback Tuning Buttons */}
      <div className="flex items-center justify-between pt-2.5 border-t border-gray-100 flex-wrap gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-semibold text-gray-500 hover:text-indigo-600 transition-colors flex items-center gap-1.5"
        >
          <span>{expanded ? "Hide technical details" : "Technical breakdown & abstract"}</span>
          <span className="text-[10px]">{expanded ? "▲" : "▼"}</span>
        </button>

        <div className="flex items-center gap-2">
          {feedbackToast && (
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {feedbackToast}
            </span>
          )}

          {onRate && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 mr-0.5 hidden sm:inline">Tune:</span>
              <button
                type="button"
                onClick={() => handleRateWithFeedback("more")}
                title="More like this (improves future suggestions)"
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                  currentRating === "more"
                    ? "bg-emerald-100 text-emerald-800 font-semibold ring-1 ring-emerald-300"
                    : "bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200"
                }`}
              >
                <span>👍</span>
                <span>More</span>
              </button>
              <button
                type="button"
                onClick={() => handleRateWithFeedback("less")}
                title="Less like this (reduces similar papers)"
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                  currentRating === "less"
                    ? "bg-rose-100 text-rose-800 font-semibold ring-1 ring-rose-300"
                    : "bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200"
                }`}
              >
                <span>👎</span>
                <span>Less</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Sections */}
      {expanded && (
        <div className="mt-3.5 pt-3.5 border-t border-gray-100 space-y-3 text-xs">
          {paper.problem && (
            <div>
              <p className="font-semibold text-gray-700 mb-0.5">🔍 Problem Solved</p>
              <p className="text-gray-600 leading-relaxed">{paper.problem}</p>
            </div>
          )}
          {paper.approach && (
            <div>
              <p className="font-semibold text-gray-700 mb-0.5">⚙️ Methodology & Approach</p>
              <p className="text-gray-600 leading-relaxed">{paper.approach}</p>
            </div>
          )}
          {paper.results && (
            <div>
              <p className="font-semibold text-gray-700 mb-0.5">📊 Empirical Results</p>
              <p className="text-gray-600 leading-relaxed">{paper.results}</p>
            </div>
          )}
          {paper.abstract && (
            <div>
              <p className="font-semibold text-gray-700 mb-0.5">Abstract</p>
              <p className="text-gray-500 leading-relaxed italic">{paper.abstract}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PaperCard;
