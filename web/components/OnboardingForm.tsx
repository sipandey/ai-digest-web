"use client";

import { useClerk } from "@clerk/nextjs";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIMEZONES, fmtRawOffset, detectTimezoneOffset } from "@/lib/timezones";

// ── Types ──────────────────────────────────────────────────────────────────────

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
  digestHour: number;
  timezoneOffset: number;
};

type ConnectionStatus = "idle" | "testing" | "success" | "error";

// ── Constants ──────────────────────────────────────────────────────────────────

const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string; sub: string }[] = [
  { value: "beginner", label: "Complete beginner", sub: "Just starting with AI" },
  { value: "developer_learning_ai", label: "Developer learning AI", sub: "Know how to code, learning ML concepts" },
  { value: "practitioner", label: "Practitioner", sub: "Building AI systems regularly" },
  { value: "ml_engineer", label: "ML Engineer", sub: "Training models, deep ML work" },
];

// Match the full topic list from SetupForm
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

const TOTAL_STEPS = 4;

// ── Main component ─────────────────────────────────────────────────────────────

export default function OnboardingForm() {
  const router = useRouter();
  const { signOut } = useClerk();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(() => ({
    profileDescription: "",
    experienceLevel: "developer_learning_ai",
    topics: [],
    notionToken: "",
    notionDatabaseId: "",
    digestHour: 7,
    timezoneOffset: detectTimezoneOffset(),
  }));

  const [topicInput, setTopicInput] = useState("");
  const [topicError, setTopicError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // ── Validation ───────────────────────────────────────────────────────────────
  const step1Valid = form.profileDescription.trim().length >= 50;
  const step2Valid = form.topics.length >= 1;
  const step3Complete = connectionStatus === "success";

  // ── Topic helpers ─────────────────────────────────────────────────────────────
  function addTopic(raw: string) {
    const topic = raw.trim();
    if (!topic) return;
    if (form.topics.includes(topic)) { setTopicError("Already added."); return; }
    if (form.topics.length >= 5) { setTopicError("Maximum 5 topics."); return; }
    setForm((f) => ({ ...f, topics: [...f.topics, topic] }));
    setTopicInput("");
    setTopicError("");
  }

  function removeTopic(topic: string) {
    setForm((f) => ({ ...f, topics: f.topics.filter((t) => t !== topic) }));
  }

  // ── Async actions ─────────────────────────────────────────────────────────────
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
        body: JSON.stringify({
          profileDescription: form.profileDescription,
          experienceLevel: form.experienceLevel,
          topics: form.topics,
          notionToken: form.notionToken,
          notionDatabaseId: form.notionDatabaseId,
          digestHour: form.digestHour,
          timezoneOffset: form.timezoneOffset,
        }),
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

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f4f4f8] flex flex-col items-center justify-start py-10 px-4">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
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
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i + 1 <= step ? "bg-indigo-500" : "bg-gray-200"
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-gray-400">Step {step} of {TOTAL_STEPS}</p>
      </div>

      {/* ── Card ────────────────────────────────────────────────────────────── */}
      <div className="w-full max-w-[480px] bg-white border border-gray-200 rounded-2xl p-7">

        {/* ── STEP 1: Profile ─────────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <h1 className="text-xl font-bold text-[#14141e] mb-1">What are you working on?</h1>
            <p className="text-sm text-gray-500 mb-7">This shapes how we score papers for you.</p>

            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Your project
              </label>
              <textarea
                rows={4}
                value={form.profileDescription}
                onChange={(e) => setForm((f) => ({ ...f, profileDescription: e.target.value }))}
                placeholder="e.g. I'm building a customer support chatbot using RAG. I have web development experience and I'm learning AI. I want papers I can build from immediately."
                className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm text-[#14141e] placeholder:text-gray-300 focus:outline-none resize-none transition-colors"
              />
              <p className={`text-xs mt-2 transition-colors ${form.profileDescription.trim().length >= 50 ? "text-emerald-600" : "text-gray-300"}`}>
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
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${form.experienceLevel === value ? "border-indigo-500" : "border-gray-300"}`}>
                      {form.experienceLevel === value && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#14141e]">{label}</p>
                      <p className="text-xs text-gray-400">{sub}</p>
                    </div>
                    <input type="radio" name="experienceLevel" value={value} checked={form.experienceLevel === value} onChange={() => setForm((f) => ({ ...f, experienceLevel: value }))} className="sr-only" />
                  </label>
                ))}
              </div>
            </div>

            <PrimaryButton onClick={() => setStep(2)} disabled={!step1Valid}>Continue</PrimaryButton>
          </>
        )}

        {/* ── STEP 2: Topics ───────────────────────────────────────────────── */}
        {step === 2 && (
          <>
            <h1 className="text-xl font-bold text-[#14141e] mb-1">What topics interest you?</h1>
            <p className="text-sm text-gray-500 mb-7">Pick at least one. Specific beats generic.</p>

            {/* Chip picker (matches SetupForm) */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick-select</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_TOPICS.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      if (form.topics.includes(t)) {
                        setForm((f) => ({ ...f, topics: f.topics.filter((x) => x !== t) }));
                      } else if (form.topics.length < 5) {
                        setForm((f) => ({ ...f, topics: [...f.topics, t] }));
                      }
                    }}
                    className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
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

            {/* Custom topic input */}
            <div className="mb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Or type your own</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={topicInput}
                  onChange={(e) => { setTopicInput(e.target.value); setTopicError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTopic(topicInput); } }}
                  placeholder="e.g. RAG for customer support"
                  disabled={form.topics.length >= 5}
                  className="flex-1 bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-2.5 text-sm text-[#14141e] placeholder:text-gray-300 focus:outline-none disabled:opacity-40 transition-colors"
                />
                <button
                  onClick={() => addTopic(topicInput)}
                  disabled={form.topics.length >= 5}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shrink-0"
                >
                  Add
                </button>
              </div>
              {topicError && <p className="text-xs text-red-500 mt-1">{topicError}</p>}
              {form.topics.length >= 5 && <p className="text-xs text-amber-600 mt-1">5 topics maximum</p>}
            </div>

            {/* Selected topics */}
            {form.topics.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4 mb-6">
                {form.topics.map((t) => (
                  <span key={t} className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-sm px-3 py-1.5 rounded-full">
                    {t}
                    <button onClick={() => removeTopic(t)} aria-label={`Remove ${t}`} className="text-indigo-400 hover:text-indigo-700 leading-none ml-0.5">×</button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <GhostButton onClick={() => setStep(1)}>Back</GhostButton>
              <PrimaryButton onClick={() => setStep(3)} disabled={!step2Valid}>Continue</PrimaryButton>
            </div>
          </>
        )}

        {/* ── STEP 3: Connect Notion ───────────────────────────────────────── */}
        {step === 3 && (
          <>
            <h1 className="text-xl font-bold text-[#14141e] mb-1">Connect Notion</h1>
            <p className="text-sm text-gray-500 mb-7">Your digest will be delivered here every morning.</p>

            <ol className="space-y-2 mb-7">
              {[
                <>Go to <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-medium">notion.so/my-integrations</a></>,
                <>Click <strong>&quot;New integration&quot;</strong> → name it &quot;AI Digest&quot; → save</>,
                <>Enable <strong>Read content</strong>, <strong>Insert content</strong>, and <strong>Update content</strong> capabilities</>,
                <>Copy the <strong>Internal Integration Secret</strong> (starts with <code className="bg-gray-100 px-1 rounded text-xs">ntn_</code>)</>,
                <>Create a new Notion database (full page) — or use an existing one</>,
                <>Open the database → <code className="bg-gray-100 px-1 rounded text-xs">···</code> → <strong>Connections</strong> → add AI Digest</>,
                <>Copy the <strong>Database ID</strong> from the URL (32-character hex string)</>,
              ].map((text, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-indigo-500 font-bold text-xs shrink-0 w-4 text-right mt-0.5">{i + 1}.</span>
                  <span className="text-sm text-gray-500">{text}</span>
                </li>
              ))}
            </ol>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Integration Token</label>
                <input
                  type="password"
                  value={form.notionToken}
                  onChange={(e) => { setForm((f) => ({ ...f, notionToken: e.target.value })); setConnectionStatus("idle"); }}
                  placeholder="ntn_xxxxxxxxxxxx"
                  className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm font-mono text-[#14141e] placeholder:text-gray-300 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Database ID</label>
                <input
                  type="text"
                  value={form.notionDatabaseId}
                  onChange={(e) => { setForm((f) => ({ ...f, notionDatabaseId: e.target.value })); setConnectionStatus("idle"); }}
                  placeholder="32 character ID from the URL"
                  className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm font-mono text-[#14141e] placeholder:text-gray-300 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <button
              onClick={testConnection}
              disabled={!form.notionToken || !form.notionDatabaseId || connectionStatus === "testing"}
              className="w-full border border-indigo-400 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 font-medium py-3 rounded-xl text-sm mb-4 transition-colors"
            >
              {connectionStatus === "testing" ? (
                <span className="flex items-center justify-center gap-2"><Spinner /> Testing connection…</span>
              ) : "Test connection"}
            </button>

            {connectionStatus === "success" && (
              <p className="text-sm text-emerald-600 flex items-center gap-2 mb-4"><span>✓</span> Connected successfully</p>
            )}
            {connectionStatus === "error" && (
              <p className="text-sm text-red-500 mb-4">{connectionError}</p>
            )}

            <div className="flex gap-3 mt-2">
              <GhostButton onClick={() => setStep(2)}>Back</GhostButton>
              <PrimaryButton onClick={() => setStep(4)} disabled={!step3Complete}>Continue</PrimaryButton>
            </div>
          </>
        )}

        {/* ── STEP 4: Delivery schedule ────────────────────────────────────── */}
        {step === 4 && (
          <>
            <h1 className="text-xl font-bold text-[#14141e] mb-1">When should we deliver?</h1>
            <p className="text-sm text-gray-500 mb-7">You can change this any time in settings.</p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Delivery time</label>
                <select
                  value={form.digestHour}
                  onChange={(e) => setForm((f) => ({ ...f, digestHour: Number(e.target.value) }))}
                  className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm text-[#14141e] focus:outline-none transition-colors"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>{fmtHour(h)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Timezone</label>
                <select
                  value={form.timezoneOffset}
                  onChange={(e) => setForm((f) => ({ ...f, timezoneOffset: Number(e.target.value) }))}
                  className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm text-[#14141e] focus:outline-none transition-colors"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.offset} value={tz.offset}>{tz.label}</option>
                  ))}
                </select>
              </div>

              {/* Delivery confirmation hint */}
              <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-indigo-400 shrink-0">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                </svg>
                <p className="text-xs text-indigo-700">
                  Your digest will be delivered at{" "}
                  <span className="font-semibold">{fmtHour(form.digestHour)}</span>
                  {" "}
                  <span className="text-indigo-500">({fmtRawOffset(form.timezoneOffset)})</span>
                  {" "}each day
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <GhostButton onClick={() => setStep(3)}>Back</GhostButton>
              <PrimaryButton onClick={completeSetup} disabled={saving}>
                {saving ? (
                  <span className="flex items-center justify-center gap-2"><Spinner /> Saving…</span>
                ) : "Complete setup"}
              </PrimaryButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Shared primitives ──────────────────────────────────────────────────────────

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-30 text-white font-semibold py-3 px-3 rounded-xl text-sm transition-colors"
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
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
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
