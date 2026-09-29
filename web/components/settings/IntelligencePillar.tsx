"use client";

import { useState } from "react";
import {
  DigestLens,
  ExperienceLevel,
  FeedbackStats,
  DIGEST_LENSES,
  EXPERIENCE_LEVELS,
  SUGGESTED_TOPICS,
} from "./types";

export default function IntelligencePillar({
  digestLens,
  setDigestLens,
  topics,
  setTopics,
  profileDesc,
  setProfileDesc,
  experienceLevel,
  setExperienceLevel,
  feedbackStats,
  onResetFeedback,
  resettingFeedback,
}: {
  digestLens: DigestLens;
  setDigestLens: (l: DigestLens) => void;
  topics: string[];
  setTopics: (t: string[]) => void;
  profileDesc: string;
  setProfileDesc: (d: string) => void;
  experienceLevel: ExperienceLevel;
  setExperienceLevel: (e: ExperienceLevel) => void;
  feedbackStats: FeedbackStats | null;
  onResetFeedback: () => Promise<void>;
  resettingFeedback: boolean;
}) {
  const [topicInput, setTopicInput] = useState("");
  const [topicError, setTopicError] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  function addTopic(raw: string) {
    const topic = raw.trim();
    if (!topic) return;
    if (topics.includes(topic)) { setTopicError("Already added."); return; }
    if (topics.length >= 5) { setTopicError("Maximum 5 topics."); return; }
    setTopics([...topics, topic]);
    setTopicInput("");
    setTopicError("");
  }

  function removeTopic(topic: string) {
    setTopics(topics.filter((x) => x !== topic));
  }

  return (
    <div className="space-y-6">
      {/* Digest Lens */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
        <h2 className="text-sm font-semibold text-[#14141e] mb-1">Digest Lens</h2>
        <p className="text-xs text-gray-500 mb-4">
          Determines how arXiv papers are scored, filtered, and structured for your daily workflow.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {DIGEST_LENSES.map(({ value, label, sub, icon }) => (
            <label
              key={value}
              className={`flex flex-col p-4 rounded-xl border cursor-pointer transition-all ${
                digestLens === value
                  ? "border-indigo-600 bg-indigo-50/50 shadow-xs ring-1 ring-indigo-500/20"
                  : "border-gray-200 hover:border-gray-300 bg-gray-50/30"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xl" role="img" aria-label={label}>{icon}</span>
                <p className="text-sm font-bold text-[#14141e]">{label}</p>
              </div>
              <p className="text-xs text-gray-500 leading-snug">{sub}</p>
              <input
                type="radio"
                name="digestLens"
                value={value}
                checked={digestLens === value}
                onChange={() => setDigestLens(value)}
                className="sr-only"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Focus Topics */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-[#14141e]">Focus Topics</h2>
          <span className="text-xs text-gray-400">{topics.length} / 5 selected</span>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Pick up to 5 focus areas. Papers matching these topics receive significant priority boosts.
        </p>

        {/* Quick Select Chips */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Quick-select</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_TOPICS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  if (topics.includes(t)) {
                    removeTopic(t);
                  } else if (topics.length < 5) {
                    setTopics([...topics, t]);
                  }
                }}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                  topics.includes(t)
                    ? "bg-indigo-600 text-white border-indigo-600 font-medium"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {topics.includes(t) ? `✓ ${t}` : `+ ${t}`}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Topic Input */}
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={topicInput}
            onChange={(e) => { setTopicInput(e.target.value); setTopicError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTopic(topicInput); } }}
            placeholder="Or type a custom research topic..."
            disabled={topics.length >= 5}
            className="flex-1 bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-2.5 text-sm text-[#14141e] placeholder:text-gray-400 focus:outline-none disabled:opacity-40 transition-colors"
          />
          <button
            type="button"
            onClick={() => addTopic(topicInput)}
            disabled={topics.length >= 5}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            Add
          </button>
        </div>
        {topicError && <p className="text-xs text-red-500 mb-2">{topicError}</p>}

        {/* Active Topics Chips */}
        {topics.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
            {topics.map((t) => (
              <span
                key={t}
                className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-medium px-3 py-1.5 rounded-full"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTopic(t)}
                  aria-label={`Remove ${t}`}
                  className="text-indigo-400 hover:text-indigo-700 text-sm leading-none ml-1 cursor-pointer"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Project Context & Experience Level */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-[#14141e]">What you&apos;re building or learning</label>
            <span className="text-xs text-gray-400">{profileDesc.length} / 500</span>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            This narrative profile provides context to the scoring model when calculating project relevance.
          </p>
          <textarea
            rows={3}
            value={profileDesc}
            maxLength={500}
            onChange={(e) => setProfileDesc(e.target.value)}
            placeholder="e.g. I'm building an autonomous agent framework using vector search and tool calling. I want practical engineering takeaways."
            className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm text-[#14141e] placeholder:text-gray-400 focus:outline-none resize-none transition-colors"
          />
        </div>

        <div className="pt-2 border-t border-gray-100">
          <label className="block text-sm font-semibold text-[#14141e] mb-1">Experience Level</label>
          <p className="text-xs text-gray-500 mb-3">Tunes the technical depth and explanation level of summaries.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {EXPERIENCE_LEVELS.map(({ value, label, sub }) => (
              <label
                key={value}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  experienceLevel === value
                    ? "border-indigo-500 bg-indigo-50/40 font-medium"
                    : "border-gray-200 hover:border-gray-300 bg-gray-50/30"
                }`}
              >
                <input
                  type="radio"
                  name="experienceLevel"
                  value={value}
                  checked={experienceLevel === value}
                  onChange={() => setExperienceLevel(value)}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <p className="text-xs font-semibold text-[#14141e]">{label}</p>
                  <p className="text-[11px] text-gray-400">{sub}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* AI Recommendation Memory Card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#14141e]">AI Feedback Memory</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Your 👍 / 👎 ratings dynamically tune future paper recommendations (+1.5 upvotes, -2.0 downvotes).
            </p>
          </div>
          {feedbackStats && feedbackStats.total > 0 && !showResetConfirm && (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="text-xs text-red-600 hover:text-red-700 font-medium border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Reset Memory
            </button>
          )}
        </div>

        <div className="mt-4 flex items-center gap-4 bg-gray-50 rounded-xl p-3.5 border border-gray-100 text-xs">
          <div>
            <span className="text-gray-400">Total rated: </span>
            <span className="font-semibold text-[#14141e]">{feedbackStats?.total ?? 0} papers</span>
          </div>
          <div>
            <span className="text-gray-400">Upvoted: </span>
            <span className="font-semibold text-emerald-600">{feedbackStats?.more ?? 0}</span>
          </div>
          <div>
            <span className="text-gray-400">Downvoted: </span>
            <span className="font-semibold text-red-500">{feedbackStats?.less ?? 0}</span>
          </div>
        </div>

        {showResetConfirm && (
          <div className="mt-3 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-3">
            <p className="text-xs text-red-700">Clear all rating history? Recommendations will return to baseline.</p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onResetFeedback();
                  setShowResetConfirm(false);
                }}
                disabled={resettingFeedback}
                className="text-xs bg-red-600 hover:bg-red-700 text-white font-semibold px-3 py-1 rounded-lg"
              >
                {resettingFeedback ? "Resetting..." : "Confirm Reset"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
