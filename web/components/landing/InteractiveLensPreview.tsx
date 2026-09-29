"use client";

import { useState } from "react";

type LensType = "builder" | "founder" | "researcher";

const LENS_DATA: Record<
  LensType,
  {
    tabLabel: string;
    icon: string;
    spotlightTitle: string;
    spotlightIcon: string;
    takeaway: string;
    subTitle: string;
    subContent: string;
    bannerGradient: string;
    borderAccent: string;
  }
> = {
  builder: {
    tabLabel: "Builder Lens",
    icon: "🏗️",
    spotlightTitle: "Builder Takeaway",
    spotlightIcon: "🏗️",
    takeaway:
      "Add a summarisation layer above your vector store: cluster leaf chunks nightly with k-means, embed GPT-4 summaries into a recursive abstraction tree, and query across all levels for multi-hop retrieval.",
    subTitle: "📚 Prerequisites Before Reading",
    subContent:
      "Understand vector similarity search, hierarchical clustering, and basic RAG pipeline architectures.",
    bannerGradient: "from-indigo-50 via-indigo-50/50 to-transparent",
    borderAccent: "border-indigo-500",
  },
  founder: {
    tabLabel: "Founder Lens",
    icon: "🎯",
    spotlightTitle: "Product Opportunity",
    spotlightIcon: "🎯",
    takeaway:
      "Unlocks high-value document QA over complex enterprise corpora (financial filings, clinical protocols, technical manuals) without context window ballooning or hallucination. Defensible RAG architecture.",
    subTitle: "💡 Market & Cost Signal",
    subContent:
      "Direct replacement for expensive long-context brute force prompting with +20% higher multi-hop accuracy at a fraction of token inference cost.",
    bannerGradient: "from-emerald-50 via-emerald-50/50 to-transparent",
    borderAccent: "border-emerald-500",
  },
  researcher: {
    tabLabel: "Researcher Lens",
    icon: "🔬",
    spotlightTitle: "Theoretical Insight",
    spotlightIcon: "🔬",
    takeaway:
      "Demonstrates that recursive abstraction trees bridge local text semantics and global document coherence, overcoming fundamental information bottlenecks in dense retrieval architectures.",
    subTitle: "📖 Theoretical Foundations",
    subContent:
      "Tree-structured indexation, dense retriever latent representations, recursive summarization dynamics.",
    bannerGradient: "from-purple-50 via-purple-50/50 to-transparent",
    borderAccent: "border-purple-500",
  },
};

export function InteractiveLensPreview() {
  const [activeLens, setActiveLens] = useState<LensType>("builder");
  const data = LENS_DATA[activeLens];

  return (
    <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm max-w-2xl mx-auto transition-all">
      {/* Top Lens Selector Tabs */}
      <div className="bg-gray-50/80 px-4 sm:px-6 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
          Interactive Synthesis Lens:
        </span>
        <div className="flex items-center gap-1.5 p-1 bg-white rounded-xl border border-gray-200 shadow-2xs">
          {(["builder", "founder", "researcher"] as LensType[]).map((lens) => (
            <button
              key={lens}
              type="button"
              onClick={() => setActiveLens(lens)}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                activeLens === lens
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              <span>{LENS_DATA[lens].icon}</span>
              <span>{LENS_DATA[lens].tabLabel}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Paper Card Body */}
      <div className="p-6">
        {/* Paper Meta */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300/50">
            9.1 / 10 Match
          </span>
          <span className="text-xs bg-gray-100 text-gray-600 font-mono px-2 py-0.5 rounded-md">
            cs.LG · Retrieval Systems
          </span>
          <span className="text-xs text-gray-400">Published yesterday</span>
        </div>

        <h3 className="text-base sm:text-lg font-bold text-[#14141e] leading-snug mb-1">
          RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Sarthi et al. · Stanford University · arXiv:2401.18059
        </p>

        {/* Dynamic Lens Spotlight Callout */}
        <div
          className={`bg-gradient-to-r ${data.bannerGradient} border-l-4 ${data.borderAccent} rounded-r-2xl p-4 mb-5 space-y-2 transition-all`}
        >
          <div>
            <p className="text-[11px] font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
              <span>{data.spotlightIcon}</span>
              <span>{data.spotlightTitle}</span>
            </p>
            <p className="text-xs text-gray-900 font-medium leading-relaxed mt-1">
              {data.takeaway}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
              {data.subTitle}
            </p>
            <p className="text-xs text-gray-600 leading-relaxed mt-0.5">
              {data.subContent}
            </p>
          </div>
        </div>

        {/* Structured Technical Highlights */}
        <div className="divide-y divide-gray-100 text-xs">
          <div className="py-2.5">
            <span className="font-bold text-gray-700">🔍 Problem: </span>
            <span className="text-gray-600">
              Standard RAG retrieves only short, local chunks, failing on complex multi-hop queries that span documents.
            </span>
          </div>
          <div className="py-2.5">
            <span className="font-bold text-gray-700">⚙️ Approach: </span>
            <span className="text-gray-600">
              Clusters text chunks, generates recursive cluster summaries with an LLM, and retrieves from all abstraction levels.
            </span>
          </div>
          <div className="py-2.5">
            <span className="font-bold text-gray-700">📊 Results: </span>
            <span className="text-gray-600 font-medium text-emerald-800">
              +20% accuracy gain on QASPER and QuALITY vs flat RAG; +35% on multi-hop questions.
            </span>
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div className="px-6 py-3 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between text-xs">
        <span className="text-indigo-600 font-medium flex items-center gap-1">
          <span>Read paper in full</span>
          <span>↗</span>
        </span>
        <span className="text-gray-400">Delivered daily at 07:00 IST · AI Digest</span>
      </div>
    </div>
  );
}

export default InteractiveLensPreview;
