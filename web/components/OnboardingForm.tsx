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

const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: "beginner", label: "Complete beginner — just starting with AI" },
  {
    value: "developer_learning_ai",
    label: "Developer learning AI — know how to code, learning ML concepts",
  },
  {
    value: "practitioner",
    label: "Practitioner — building AI systems regularly",
  },
  { value: "ml_engineer", label: "ML Engineer — training models, deep ML work" },
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

  // Step 2
  const [topicInput, setTopicInput] = useState("");
  const [topicError, setTopicError] = useState("");

  // Step 3
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
      setTopicError("Topic already added.");
      return;
    }
    if (form.topics.length >= 5) {
      setTopicError("Maximum 5 topics allowed.");
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
      if (res.ok) {
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
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start py-12 px-4">
      {/* Progress */}
      <div className="w-full max-w-lg mb-8">
        <div className="mb-3 flex items-center justify-between gap-4">
          <p className="text-sm font-semibold text-indigo-600">arXiv Digest</p>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${
                s <= step ? "bg-indigo-600" : "bg-gray-200"
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">Step {step} of 3</p>
      </div>

      <div className="w-full max-w-lg bg-white rounded-xl border border-gray-200 p-8">
        {/* ── STEP 1 ─────────────────────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-6">
              What are you working on?
            </h1>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Describe what you&apos;re building or learning
              </label>
              <textarea
                rows={5}
                value={form.profileDescription}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    profileDescription: e.target.value,
                  }))
                }
                placeholder="e.g. I'm building a customer support chatbot using RAG. I have web development experience and I'm learning AI. I want papers I can build from immediately."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
              <p
                className={`text-xs mt-1 ${
                  form.profileDescription.trim().length >= 50
                    ? "text-green-600"
                    : "text-gray-400"
                }`}
              >
                {form.profileDescription.trim().length} / 50 characters minimum
              </p>
            </div>

            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Your AI experience level
              </label>
              <div className="space-y-3">
                {EXPERIENCE_LEVELS.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex items-start gap-3 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="experienceLevel"
                      value={value}
                      checked={form.experienceLevel === value}
                      onChange={() =>
                        setForm((f) => ({ ...f, experienceLevel: value }))
                      }
                      className="mt-0.5 accent-indigo-600"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!step1Valid}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-200 text-white font-medium py-3 rounded-lg text-sm"
            >
              Next
            </button>
          </>
        )}

        {/* ── STEP 2 ─────────────────────────────────────────────────────────── */}
        {step === 2 && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              What topics interest you?
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              Add up to 5 topics. Be specific — &quot;RAG for customer
              support&quot; is better than just &quot;RAG&quot;.
            </p>

            <div className="flex gap-2 mb-1">
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
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={() => addTopic(topicInput)}
                disabled={form.topics.length >= 5}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-200 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                Add topic
              </button>
            </div>
            {topicError && (
              <p className="text-xs text-red-500 mt-1">{topicError}</p>
            )}
            <p className="text-xs text-gray-400 mt-1 mb-4">
              {form.topics.length} / 5 topics
            </p>

            {form.topics.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {form.topics.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 text-sm px-3 py-1.5 rounded-full border border-indigo-200"
                  >
                    {t}
                    <button
                      onClick={() => removeTopic(t)}
                      aria-label={`Remove ${t}`}
                      className="text-indigo-400 hover:text-indigo-700 leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="mb-8">
              <p className="text-xs font-medium text-gray-500 mb-2">
                Suggested topics
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_TOPICS.filter((s) => !form.topics.includes(s)).map(
                  (s) => (
                    <button
                      key={s}
                      onClick={() => addTopic(s)}
                      disabled={form.topics.length >= 5}
                      className="text-sm text-gray-600 bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40 px-3 py-1.5 rounded-full border border-gray-200 hover:border-indigo-200"
                    >
                      + {s}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 border border-gray-300 hover:border-gray-400 text-gray-700 font-medium py-3 rounded-lg text-sm"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!step2Valid}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-200 text-white font-medium py-3 rounded-lg text-sm"
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* ── STEP 3 ─────────────────────────────────────────────────────────── */}
        {step === 3 && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-6">
              Connect your Notion workspace
            </h1>

            <ol className="space-y-2.5 mb-8 text-sm text-gray-600">
              {[
                <>
                  Go to{" "}
                  <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                    notion.so/my-integrations
                  </code>
                </>,
                <>Click &quot;New integration&quot;</>,
                <>Name it &quot;arXiv Digest&quot; and save</>,
                <>Copy the Internal Integration Token</>,
                <>Create a new Notion database (full page)</>,
                <>
                  Open the database →{" "}
                  <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                    ...
                  </code>{" "}
                  menu → Connections → add your arXiv Digest integration
                </>,
                <>Copy the Database ID from the URL</>,
              ].map((text, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-indigo-600 font-semibold shrink-0">
                    {i + 1}.
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>

            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notion Integration Token
                </label>
                <input
                  type="password"
                  value={form.notionToken}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, notionToken: e.target.value }));
                    setConnectionStatus("idle");
                  }}
                  placeholder="secret_xxxxxxxxxxxx"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notion Database ID
                </label>
                <input
                  type="text"
                  value={form.notionDatabaseId}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...f,
                      notionDatabaseId: e.target.value,
                    }));
                    setConnectionStatus("idle");
                  }}
                  placeholder="32 character ID from the URL"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              className="w-full border border-indigo-600 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 font-medium py-2.5 rounded-lg text-sm mb-3"
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
              <p className="text-sm text-green-600 flex items-center gap-1.5 mb-2">
                <span>✓</span> Connected successfully
              </p>
            )}
            {connectionStatus === "error" && (
              <p className="text-sm text-red-500 mb-2">{connectionError}</p>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep(2)}
                className="flex-1 border border-gray-300 hover:border-gray-400 text-gray-700 font-medium py-3 rounded-lg text-sm"
              >
                Back
              </button>
              <button
                onClick={completeSetup}
                disabled={!step3Complete || saving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-200 text-white font-medium py-3 rounded-lg text-sm"
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner /> Saving…
                  </span>
                ) : (
                  "Complete setup"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
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
