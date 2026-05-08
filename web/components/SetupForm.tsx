"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIMEZONES, fmtRawOffset, detectTimezoneOffset } from "@/lib/timezones";

// ── Types ─────────────────────────────────────────────────────────────────────

type ExperienceLevel =
  | "beginner"
  | "developer_learning_ai"
  | "practitioner"
  | "ml_engineer";

type Step = "notion" | "profile" | "schedule" | "done";
type GuideSection = "integration" | "database" | "share" | null;

type FormState = {
  notionToken: string;
  notionDatabaseId: string;
  topics: string[];
  profileDescription: string;
  experienceLevel: ExperienceLevel;
  digestHour: number;
  timezoneOffset: number; // decimal hours, e.g. 5.5 for IST
  email: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string; sub: string }[] = [
  { value: "beginner", label: "Complete beginner", sub: "Just starting with AI" },
  {
    value: "developer_learning_ai",
    label: "Developer learning AI",
    sub: "Know how to code, learning ML concepts",
  },
  { value: "practitioner", label: "Practitioner", sub: "Building AI systems regularly" },
  { value: "ml_engineer", label: "ML Engineer", sub: "Training models, deep ML work" },
];

const SUGGESTED_TOPICS = [
  "RAG and retrieval systems",
  "AI agents and automation",
  "LLM application development",
  "Fine-tuning and RLHF",
  "Multimodal AI",
  "AI safety and alignment",
  "Embeddings and vector search",
  "Evaluation and benchmarking",
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function fmtHour(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}

const STEPS: Step[] = ["notion", "profile", "schedule", "done"];
const STEP_LABELS: Record<Step, string> = {
  notion: "Connect Notion",
  profile: "Your interests",
  schedule: "Delivery",
  done: "Done",
};

// ── Main component ────────────────────────────────────────────────────────────

export default function SetupForm() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("notion");
  const [form, setForm] = useState<FormState>(() => ({
    notionToken: "",
    notionDatabaseId: "",
    topics: [],
    profileDescription: "",
    experienceLevel: "developer_learning_ai",
    digestHour: 7,
    timezoneOffset: detectTimezoneOffset(),
    email: "",
  }));
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideSection, setGuideSection] = useState<GuideSection>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [connectionError, setConnectionError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // ── Helpers ────────────────────────────────────────────────────────────────

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleTopic(topic: string) {
    set(
      "topics",
      form.topics.includes(topic)
        ? form.topics.filter((t) => t !== topic)
        : [...form.topics, topic],
    );
  }

  async function testConnection() {
    setConnectionStatus("testing");
    setConnectionError("");
    try {
      // Validate by calling GET /api/users/test-notion (reuse existing route)
      const res = await fetch("/api/users/test-notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionToken: form.notionToken,
          notionDatabaseId: form.notionDatabaseId,
        }),
      });
      if (res.ok) {
        setConnectionStatus("success");
      } else {
        const data = await res.json().catch(() => ({}));
        setConnectionError(
          (data as { error?: string }).error ??
            "Could not connect. Check your token and database ID.",
        );
        setConnectionStatus("error");
      }
    } catch {
      setConnectionError("Network error. Please try again.");
      setConnectionStatus("error");
    }
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/guest/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionToken: form.notionToken,
          notionDatabaseId: form.notionDatabaseId,
          topics: form.topics,
          profileDescription: form.profileDescription || null,
          experienceLevel: form.experienceLevel,
          digestHour: form.digestHour,
          timezoneOffset: form.timezoneOffset,
          email: form.email || null,
        }),
      });
      if (res.ok) {
        setStep("done");
      } else {
        const data = await res.json().catch(() => ({}));
        setSubmitError(
          (data as { error?: string }).error ?? "Something went wrong. Please try again.",
        );
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const stepIndex = STEPS.indexOf(step);
  const canGoBack = stepIndex > 0 && step !== "done";

  // ── Step validation ────────────────────────────────────────────────────────
  const notionValid =
    form.notionToken.trim().length > 10 &&
    form.notionDatabaseId.trim().length > 10 &&
    connectionStatus === "success";

  const profileValid = form.topics.length > 0;

  function canAdvance(): boolean {
    if (step === "notion") return notionValid;
    if (step === "profile") return profileValid;
    if (step === "schedule") return true;
    return false;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f4f4f8] flex flex-col items-center justify-center px-4 py-12">
      {/* Header */}
      <div className="mb-8 text-center">
        <span className="font-bold text-xl tracking-tight text-[#14141e]">AI Digest</span>
      </div>

      <div className="w-full max-w-lg">
        {/* Progress dots */}
        {step !== "done" && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {(["notion", "profile", "schedule"] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i <= stepIndex ? "bg-indigo-600" : "bg-gray-300"
                  }`}
                />
                {i < 2 && (
                  <div className={`w-8 h-px ${i < stepIndex ? "bg-indigo-600" : "bg-gray-300"}`} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm border border-black/[0.06] p-8">
          {/* ── Step 1: Notion connection ────────────────────────────────────── */}
          {step === "notion" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-bold text-[#14141e]">Connect Notion</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Your digest will be delivered to a Notion database you own.
                </p>
              </div>

              {/* ── Setup guide ──────────────────────────────────────────────── */}
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 overflow-hidden">
                <button
                  onClick={() => setGuideOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
                    </svg>
                    How to get your token and database ID
                  </span>
                  <svg
                    className={`w-4 h-4 shrink-0 transition-transform ${guideOpen ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {guideOpen && (
                  <div className="border-t border-indigo-100 px-4 pb-4 pt-3 space-y-3">
                    {/* Section tabs */}
                    <div className="flex gap-1.5 flex-wrap">
                      {(["integration", "database", "share"] as GuideSection[]).map((s, i) => (
                        <button
                          key={s!}
                          onClick={() => setGuideSection(guideSection === s ? null : s)}
                          className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                            guideSection === s
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white text-indigo-700 border-indigo-200 hover:border-indigo-400"
                          }`}
                        >
                          {i + 1}. {s === "integration" ? "Create integration" : s === "database" ? "Create database" : "Share with integration"}
                        </button>
                      ))}
                    </div>

                    {/* Step 1 — Create integration */}
                    {guideSection === "integration" && (
                      <div className="space-y-2 text-xs text-gray-700">
                        <p className="font-semibold text-gray-800">Create a Notion integration</p>
                        <ol className="space-y-1.5 list-none">
                          {[
                            <>Go to <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-medium">notion.so/my-integrations</a></>,
                            <>Click <span className="font-medium">"New integration"</span></>,
                            <>Give it a name (e.g. <span className="font-mono bg-white border border-gray-200 px-1 rounded">AI Digest</span>) and select your workspace</>,
                            <>Under <span className="font-medium">Capabilities</span>, enable <span className="font-medium">Read content</span>, <span className="font-medium">Insert content</span>, and <span className="font-medium">Update content</span> — all three are required</>,
                            <>Click <span className="font-medium">"Save"</span>, then click <span className="font-medium">"Show"</span> next to the <span className="font-medium">Internal Integration Secret</span> and copy the token — it starts with <span className="font-mono bg-white border border-gray-200 px-1 rounded">ntn_</span></>,
                          ].map((text, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="shrink-0 w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-[10px]">
                                {i + 1}
                              </span>
                              <span>{text}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Step 2 — Create database */}
                    {guideSection === "database" && (
                      <div className="space-y-2 text-xs text-gray-700">
                        <p className="font-semibold text-gray-800">Create a Notion database</p>
                        <ol className="space-y-1.5 list-none">
                          {[
                            <>Open Notion and create a new page (or open an existing one)</>,
                            <>Type <span className="font-mono bg-white border border-gray-200 px-1 rounded">/database</span> and choose <span className="font-medium">"Table — Full page"</span> from the menu</>,
                            <>Give the database a name (e.g. <span className="font-mono bg-white border border-gray-200 px-1 rounded">AI Digest</span>)</>,
                            <>Open the database as a full page — click its title to open it, then click <span className="font-medium">"Open as full page"</span> if needed</>,
                            <>Copy the URL from your browser. It looks like: <span className="font-mono bg-white border border-gray-200 px-1 rounded break-all">notion.so/<b>abc123…</b>?v=…</span> — the bold part (32 hex characters) is your Database ID</>,
                          ].map((text, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="shrink-0 w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-[10px]">
                                {i + 1}
                              </span>
                              <span>{text}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Step 3 — Share with integration */}
                    {guideSection === "share" && (
                      <div className="space-y-2 text-xs text-gray-700">
                        <p className="font-semibold text-gray-800">Share your database with the integration</p>
                        <p className="text-gray-500">
                          Notion requires you to explicitly grant integrations access to each database.
                        </p>
                        <ol className="space-y-1.5 list-none">
                          {[
                            <>Open your database in Notion as a full page</>,
                            <>Click the <span className="font-medium">"···"</span> (More) button in the top-right corner of the page</>,
                            <>Click <span className="font-medium">"Connections"</span> (or <span className="font-medium">"Connect to"</span> in some Notion versions)</>,
                            <>Find the integration you created (e.g. <span className="font-mono bg-white border border-gray-200 px-1 rounded">AI Digest</span>) and click <span className="font-medium">"Connect"</span></>,
                            <>Confirm the prompt — the integration now has access to this database</>,
                          ].map((text, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="shrink-0 w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-[10px]">
                                {i + 1}
                              </span>
                              <span>{text}</span>
                            </li>
                          ))}
                        </ol>
                        <p className="text-gray-400 pt-1">
                          If the test below fails with "Database not found", this step is usually the cause.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Token + Database ID inputs */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Integration token
                  </label>
                  <input
                    type="password"
                    placeholder="ntn_…"
                    value={form.notionToken}
                    onChange={(e) => {
                      set("notionToken", e.target.value);
                      setConnectionStatus("idle");
                    }}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">
                    Found at{" "}
                    <a
                      href="https://www.notion.so/my-integrations"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline"
                    >
                      notion.so/my-integrations
                    </a>{" "}
                    → your integration → Internal Integration Secret
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Database ID
                  </label>
                  <input
                    type="text"
                    placeholder="32-character ID from your database URL"
                    value={form.notionDatabaseId}
                    onChange={(e) => {
                      set("notionDatabaseId", e.target.value);
                      setConnectionStatus("idle");
                    }}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">
                    From your database URL:{" "}
                    notion.so/<span className="font-semibold text-gray-600">32-char-id</span>?v=…
                  </p>
                </div>
              </div>

              {/* Test connection */}
              <div>
                <button
                  onClick={testConnection}
                  disabled={
                    !form.notionToken.trim() ||
                    !form.notionDatabaseId.trim() ||
                    connectionStatus === "testing"
                  }
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {connectionStatus === "testing" ? (
                    <>
                      <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      Testing…
                    </>
                  ) : connectionStatus === "success" ? (
                    <>
                      <span className="text-green-600">✓</span>
                      <span className="text-green-700">Connected successfully</span>
                    </>
                  ) : (
                    "Test connection"
                  )}
                </button>
                {connectionStatus === "error" && (
                  <p className="text-xs text-red-600 mt-2">{connectionError}</p>
                )}
              </div>

              <button
                onClick={() => setStep("profile")}
                disabled={!notionValid}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-2xl text-sm transition-colors"
              >
                Continue →
              </button>
            </div>
          )}

          {/* ── Step 2: Profile ──────────────────────────────────────────────── */}
          {step === "profile" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-bold text-[#14141e]">What do you research?</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Pick topics and your experience level so we can score papers for you.
                </p>
              </div>

              {/* Experience level */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your level
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {EXPERIENCE_LEVELS.map((lvl) => (
                    <button
                      key={lvl.value}
                      onClick={() => set("experienceLevel", lvl.value)}
                      className={`text-left p-3 rounded-xl border text-sm transition-colors ${
                        form.experienceLevel === lvl.value
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="font-medium text-[#14141e]">{lvl.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{lvl.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Topics */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Topics{" "}
                  <span className="font-normal text-gray-400">(pick at least one)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_TOPICS.map((t) => (
                    <button
                      key={t}
                      onClick={() => toggleTopic(t)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        form.topics.includes(t)
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional profile description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  What are you building?{" "}
                  <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. a RAG chatbot for customer support"
                  value={form.profileDescription}
                  onChange={(e) => set("profileDescription", e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("notion")}
                  className="px-5 py-3 rounded-2xl text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep("schedule")}
                  disabled={!profileValid}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-2xl text-sm transition-colors"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Schedule ─────────────────────────────────────────────── */}
          {step === "schedule" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-bold text-[#14141e]">When should we deliver?</h1>
                <p className="text-sm text-gray-500 mt-1">
                  You can change this any time in settings.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Time
                  </label>
                  <select
                    value={form.digestHour}
                    onChange={(e) => set("digestHour", Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {fmtHour(h)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Timezone
                  </label>
                  <select
                    value={form.timezoneOffset}
                    onChange={(e) => set("timezoneOffset", Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.offset} value={tz.offset}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Optional email */}
              <div className="border border-dashed border-gray-200 rounded-2xl p-4 space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Email{" "}
                  <span className="font-normal text-gray-400">
                    — optional, for failure alerts only
                  </span>
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
                />
                <p className="text-xs text-gray-400">
                  Also lets you sign in from another device. We won't send anything else.
                </p>
              </div>

              {submitError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                  {submitError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("profile")}
                  className="px-5 py-3 rounded-2xl text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-2xl text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                      Setting up…
                    </>
                  ) : (
                    "Start my digest →"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Done ─────────────────────────────────────────────────── */}
          {step === "done" && (
            <div className="text-center space-y-6 py-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <div>
                <h1 className="text-xl font-bold text-[#14141e]">You're all set!</h1>
                <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
                  Your first digest will arrive in Notion at{" "}
                  <strong>{fmtHour(form.digestHour)}</strong>{" "}
                  <span className="text-gray-400">({fmtRawOffset(form.timezoneOffset)})</span>{" "}
                  tomorrow morning. You can trigger one now from the dashboard.
                </p>
              </div>

              <button
                onClick={() => router.push("/dashboard")}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 rounded-2xl text-sm transition-colors"
              >
                Go to dashboard →
              </button>

              <p className="text-xs text-gray-400">
                Bookmark your dashboard URL or save your Notion token to return from
                another device.
              </p>
            </div>
          )}
        </div>

        {/* Bottom sign-in hint */}
        {step !== "done" && (
          <p className="text-center text-xs text-gray-400 mt-6">
            Already have an account?{" "}
            <a href="/login" className="text-indigo-600 hover:underline">
              Sign in
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
