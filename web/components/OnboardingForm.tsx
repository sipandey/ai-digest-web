"use client";

import { useClerk } from "@clerk/nextjs";
import { useState } from "react";
import { useRouter } from "next/navigation";

type ExperienceLevel =
  | "beginner"
  | "developer_learning_ai"
  | "practitioner"
  | "ml_engineer";

type FormData = {
  profileDescription: string;
  experienceLevel: ExperienceLevel;
  topics: string[];
  notionToken: string;
  notionDatabaseId: string;
};

type ConnectionStatus = "idle" | "testing" | "success" | "error";

const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string; sub: string }[] = [
  {
    value: "beginner",
    label: "Complete beginner",
    sub: "Just starting with AI",
  },
  {
    value: "developer_learning_ai",
    label: "Developer learning AI",
    sub: "Know how to code, learning ML concepts",
  },
  {
    value: "practitioner",
    label: "Practitioner",
    sub: "Building AI systems regularly",
  },
  {
    value: "ml_engineer",
    label: "ML Engineer",
    sub: "Training models, deep ML work",
  },
];

const SUGGESTED_TOPICS = [
  "RAG and retrieval systems",
  "AI agents and automation",
  "LLM application development",
];

export default function OnboardingForm() {
  const router = useRouter();
  const { signOut } = useClerk();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>({
    profileDescription: "",
    experienceLevel: "developer_learning_ai",
    topics: [],
    notionToken: "",
    notionDatabaseId: "",
  });

  const [topicInput, setTopicInput] = useState("");
  const [topicError, setTopicError] = useState("");

  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // ── validation ──────────────────────────────────────────────────────────────
  const step1Valid = form.profileDescription.trim().length >= 50;
  const step2Valid = form.topics.length >= 1;
  const step3Complete = connectionStatus === "success";

  // ── topic helpers ────────────────────────────────────────────────────────────
  function addTopic(raw: string) {
    const topic = raw.trim();
    if (!topic) return;
    if (form.topics.includes(topic)) {
      setTopicError("Already added.");
      return;
    }
    if (form.topics.length >= 5) {
      setTopicError("Maximum 5 topics.");
      return;
    }
    setForm((f) => ({ ...f, topics: [...f.topics, topic] }));
    setTopicInput("");
    setTopicError("");
  }

  function removeTopic(topic: string) {
    setForm((f) => ({ ...f, topics: f.topics.filter((t) => t !== topic) }));
  }

  // ── async actions ────────────────────────────────────────────────────────────
  async function testConnection() {
    setConnectionStatus("testing");
    setConnectionError("");
    try {
      const res = await fetch("/api/users/test-notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionToken: form.notionToken,
          notionDatabaseId: form.notionDatabaseId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setConnectionStatus("success");
      } else {
        setConnectionStatus("error");
        setConnectionError(data.error ?? "Connection failed.");
      }
    } catch {
      setConnectionStatus("error");
      setConnectionError("Network error — please try again.");
    }
  }

  async function completeSetup() {
    setSaving(true);
    try {
      const res = await fetch("/api/users/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json();
        alert(data.error ?? "Failed to save — please try again.");
      }
    } catch {
      alert("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut({ redirectUrl: "/" });
    } finally {
      setSigningOut(false);
    }
  }

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f4f4f8] flex flex-col items-center justify-start py-10 px-4">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="w-full max-w-[480px] mb-8">
        <div className="flex items-center justify-between mb-5">
          <span className="text-sm font-bold text-[#14141e]">AI Digest</span>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-3">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                s <= step ? "bg-indigo-500" : "bg-gray-200"
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-gray-400">Step {step} of 3</p>
      </div>

      {/* ── Card ──────────────────────────────────────────────────────────── */}
      <div className="w-full max-w-[480px] bg-white border border-gray-200 rounded-2xl p-7">

        {/* ── STEP 1 ──────────────────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <h1 className="text-xl font-bold text-[#14141e] mb-1">
              What are you working on?
            </h1>
            <p className="text-sm text-gray-500 mb-7">
              This shapes how we score papers for you.
            </p>

            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Your project
              </label>
              <textarea
                rows={4}
                value={form.profileDescription}
                onChange={(e) =>
                  setForm((f) => ({ ...f, profileDescription: e.target.value }))
                }
                placeholder="e.g. I'm building a customer support chatbot using RAG. I have web development experience and I'm learning AI. I want papers I can build from immediately."
                className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm text-[#14141e] placeholder:text-gray-300 focus:outline-none resize-none transition-colors"
              />
              <p
                className={`text-xs mt-2 transition-colors ${
                  form.profileDescription.trim().length >= 50
                    ? "text-emerald-600"
                    : "text-gray-300"
                }`}
              >
                {form.profileDescription.trim().length} / 50 minimum
              </p>
            </div>

            <div className="mb-8">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Your AI experience
              </label>
              <div className="space-y-2">
                {EXPERIENCE_LEVELS.map(({ value, label, sub }) => (
                  <label
                    key={value}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                      form.experienceLevel === value
                        ? "border-indigo-400 bg-indigo-50"
                        : "border-gray-200 hover:border-gray-300 bg-gray-50/50"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                        form.experienceLevel === value
                          ? "border-indigo-500"
                          : "border-gray-300"
                      }`}
                    >
                      {form.experienceLevel === value && (
                        <div className="w-2 h-2 rounded-full bg-indigo-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#14141e]">{label}</p>
                      <p className="text-xs text-gray-400">{sub}</p>
                    </div>
                    <input
                      type="radio"
                      name="experienceLevel"
                      value={value}
                      checked={form.experienceLevel === value}
                      onChange={() =>
                        setForm((f) => ({ ...f, experienceLevel: value }))
                      }
                      className="sr-only"
                    />
                  </label>
                ))}
              </div>
            </div>

            <PrimaryButton onClick={() => setStep(2)} disabled={!step1Valid}>
              Continue
            </PrimaryButton>
          </>
        )}

        {/* ── STEP 2 ──────────────────────────────────────────────────────── */}
        {step === 2 && (
          <>
            <h1 className="text-xl font-bold text-[#14141e] mb-1">
              What topics interest you?
            </h1>
            <p className="text-sm text-gray-500 mb-7">
              Add up to 5 topics. Specific beats generic.
            </p>

            <div className="flex gap-2 mb-1.5">
              <input
                type="text"
                value={topicInput}
                onChange={(e) => {
                  setTopicInput(e.target.value);
                  setTopicError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTopic(topicInput);
                  }
                }}
                placeholder="e.g. RAG for customer support"
                className="flex-1 bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-2.5 text-sm text-[#14141e] placeholder:text-gray-300 focus:outline-none transition-colors"
              />
              <button
                onClick={() => addTopic(topicInput)}
                disabled={form.topics.length >= 5}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shrink-0"
              >
                Add
              </button>
            </div>

            {topicError && (
              <p className="text-xs text-red-500 mt-1">{topicError}</p>
            )}
            <p className="text-xs text-gray-400 mt-1 mb-5">
              {form.topics.length} / 5 topics added
            </p>

            {form.topics.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {form.topics.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-sm px-3 py-1.5 rounded-full"
                  >
                    {t}
                    <button
                      onClick={() => removeTopic(t)}
                      aria-label={`Remove ${t}`}
                      className="text-indigo-400 hover:text-indigo-700 leading-none ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="mb-8">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Suggestions
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_TOPICS.filter(
                  (s) => !form.topics.includes(s)
                ).map((s) => (
                  <button
                    key={s}
                    onClick={() => addTopic(s)}
                    disabled={form.topics.length >= 5}
                    className="text-sm text-gray-500 bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40 px-3 py-1.5 rounded-full border border-gray-200 hover:border-indigo-200 transition-colors"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <GhostButton onClick={() => setStep(1)}>Back</GhostButton>
              <PrimaryButton onClick={() => setStep(3)} disabled={!step2Valid}>
                Continue
              </PrimaryButton>
            </div>
          </>
        )}

        {/* ── STEP 3 ──────────────────────────────────────────────────────── */}
        {step === 3 && (
          <>
            <h1 className="text-xl font-bold text-[#14141e] mb-1">
              Connect Notion
            </h1>
            <p className="text-sm text-gray-500 mb-7">
              Your digest will be delivered here every morning.
            </p>

            <ol className="space-y-2 mb-7">
              {[
                <>
                  Go to{" "}
                  <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                    notion.so/my-integrations
                  </span>
                </>,
                <>Click &quot;New integration&quot;</>,
                <>Name it &quot;AI Digest&quot; and save</>,
                <>Copy the Internal Integration Token</>,
                <>Create a new Notion database (full page)</>,
                <>
                  Open the database →{" "}
                  <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                    ...
                  </span>{" "}
                  → Connections → add AI Digest
                </>,
                <>Copy the Database ID from the URL</>,
              ].map((text, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-indigo-500 font-bold text-xs shrink-0 w-4 text-right mt-0.5">
                    {i + 1}.
                  </span>
                  <span className="text-sm text-gray-500">{text}</span>
                </li>
              ))}
            </ol>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Integration Token
                </label>
                <input
                  type="password"
                  value={form.notionToken}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, notionToken: e.target.value }));
                    setConnectionStatus("idle");
                  }}
                  placeholder="secret_xxxxxxxxxxxx"
                  className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm font-mono text-[#14141e] placeholder:text-gray-300 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Database ID
                </label>
                <input
                  type="text"
                  value={form.notionDatabaseId}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, notionDatabaseId: e.target.value }));
                    setConnectionStatus("idle");
                  }}
                  placeholder="32 character ID from the URL"
                  className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm font-mono text-[#14141e] placeholder:text-gray-300 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <button
              onClick={testConnection}
              disabled={
                !form.notionToken ||
                !form.notionDatabaseId ||
                connectionStatus === "testing"
              }
              className="w-full border border-indigo-400 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 font-medium py-3 rounded-xl text-sm mb-4 transition-colors"
            >
              {connectionStatus === "testing" ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner /> Testing connection…
                </span>
              ) : (
                "Test connection"
              )}
            </button>

            {connectionStatus === "success" && (
              <p className="text-sm text-emerald-600 flex items-center gap-2 mb-4">
                <span>✓</span> Connected successfully
              </p>
            )}
            {connectionStatus === "error" && (
              <p className="text-sm text-red-500 mb-4">{connectionError}</p>
            )}

            <div className="flex gap-3 mt-2">
              <GhostButton onClick={() => setStep(2)}>Back</GhostButton>
              <PrimaryButton
                onClick={completeSetup}
                disabled={!step3Complete || saving}
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner /> Saving…
                  </span>
                ) : (
                  "Complete setup"
                )}
              </PrimaryButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── shared primitives ──────────────────────────────────────────────────────────

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-30 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-600 font-medium py-3 rounded-xl text-sm transition-colors"
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
