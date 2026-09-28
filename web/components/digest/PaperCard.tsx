"use client";

import { useState } from "react";

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
}: {
  paper: Paper;
  lens: string;
  rank: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const score = Math.round(paper.score * 10) / 10;

  return (
    <div className="bg-white border border-gray-200 hover:border-gray-300 rounded-2xl p-5 shadow-xs transition-shadow">
      {/* Top Meta: Rank, Score, Category, Date, PDF Link */}
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-gray-400 bg-gray-100 rounded-md px-2 py-0.5 font-mono">
            #{rank}
          </span>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
              score >= 8.5
                ? "bg-emerald-100 text-emerald-800"
                : "bg-indigo-50 text-indigo-700"
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

        <a
          href={paper.pdf_url || `https://arxiv.org/pdf/${paper.arxiv_id}.pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-indigo-600 hover:text-indigo-500 font-medium shrink-0 flex items-center gap-1"
        >
          <span>PDF</span>
          <span>↗</span>
        </a>
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
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 mb-3 space-y-1.5">
        {lens === "founder" ? (
          <>
            {paper.builder_takeaway && (
              <div>
                <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">🎯 Product Opportunity</p>
                <p className="text-xs text-indigo-950 font-medium leading-relaxed mt-0.5">{paper.builder_takeaway}</p>
              </div>
            )}
            {paper.learning_path && (
              <div>
                <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">💡 Market Signal</p>
                <p className="text-xs text-indigo-900 leading-relaxed mt-0.5">{paper.learning_path}</p>
              </div>
            )}
          </>
        ) : lens === "researcher" ? (
          <>
            {paper.builder_takeaway && (
              <div>
                <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">🧪 Theoretical Insight</p>
                <p className="text-xs text-indigo-950 font-medium leading-relaxed mt-0.5">{paper.builder_takeaway}</p>
              </div>
            )}
            {paper.learning_path && (
              <div>
                <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">📖 Prerequisites & Foundations</p>
                <p className="text-xs text-indigo-900 leading-relaxed mt-0.5">{paper.learning_path}</p>
              </div>
            )}
          </>
        ) : (
          <>
            {paper.builder_takeaway && (
              <div>
                <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">🏗️ Builder Takeaway</p>
                <p className="text-xs text-indigo-950 font-medium leading-relaxed mt-0.5">{paper.builder_takeaway}</p>
              </div>
            )}
            {paper.learning_path && (
              <div>
                <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">📚 Before Reading</p>
                <p className="text-xs text-indigo-900 leading-relaxed mt-0.5">{paper.learning_path}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Expandable Breakdown Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs font-semibold text-gray-500 hover:text-indigo-600 transition-colors flex items-center gap-1.5"
      >
        <span>{expanded ? "Hide details" : "Technical breakdown & abstract"}</span>
        <span className="text-[10px]">{expanded ? "▲" : "▼"}</span>
      </button>

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
