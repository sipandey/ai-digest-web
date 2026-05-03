"use client";

import { useEffect, useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import Link from "next/link";

// ── types ─────────────────────────────────────────────────────────────────────

type ExperienceLevel =
  | "beginner"
  | "developer_learning_ai"
  | "practitioner"
  | "ml_engineer";

type Config = {
  profile_description: string;
  experience_level: ExperienceLevel;
  topics: string[];
  digest_hour: number;
  timezone_offset: number;
  notion_connected: boolean;
  notion_database_id: string | null;
};

type UserProfile = {
  email: string;
  name: string | null;
  tier: "free" | "pro";
};

type Toast = { message: string; type: "success" | "error" };
type ConnectionStatus = "idle" | "testing" | "success" | "error";

// ── constants ─────────────────────────────────────────────────────────────────

const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: "beginner", label: "Complete beginner — just starting with AI" },
  {
    value: "developer_learning_ai",
    label: "Developer learning AI — know how to code, learning ML concepts",
  },
  { value: "practitioner", label: "Practitioner — building AI systems regularly" },
  { value: "ml_engineer", label: "ML Engineer — training models, deep ML work" },
];

const TIMEZONES: { label: string; offset: number }[] = [
  { label: "UTC-8 (Pacific)", offset: -8 },
  { label: "UTC-5 (Eastern)", offset: -5 },
  { label: "UTC+0 (London)", offset: 0 },
  { label: "UTC+1 (Paris)", offset: 1 },
  { label: "UTC+3 (Moscow)", offset: 3 },
  { label: "UTC+5 (India ~)", offset: 5 },
  { label: "UTC+8 (Singapore)", offset: 8 },
  { label: "UTC+9 (Tokyo)", offset: 9 },
];

function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
}

// ── skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className: string }) {
  return <div className={`bg-gray-200 rounded animate-pulse ${className}`} />;
}

// ── toast ─────────────────────────────────────────────────────────────────────

function ToastBanner({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-lg shadow-lg text-sm font-medium ${
        toast.type === "success"
          ? "bg-green-600 text-white"
          : "bg-red-600 text-white"
      }`}
    >
      <span>{toast.message}</span>
      <button onClick={onDismiss} className="opacity-75 hover:opacity-100">
        ×
      </button>
    </div>
  );
}

// ── spinner ───────────────────────────────────────────────────────────────────

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
        cx="12" cy="12" r="10"
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

// ── main component ────────────────────────────────────────────────────────────

export default function SettingsView() {
  const { signOut } = useClerk();

  // ── data state ───────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Config | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── profile card state ───────────────────────────────────────────────────
  const [profileDesc, setProfileDesc] = useState("");
  const [experienceLevel, setExperienceLevel] =
    useState<ExperienceLevel>("developer_learning_ai");
  const [topics, setTopics] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState("");
  const [topicError, setTopicError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // ── delivery card state ───────────────────────────────────────────────────
  const [digestHour, setDigestHour] = useState(7);
  const [timezoneOffset, setTimezoneOffset] = useState(0);
  const [savingDelivery, setSavingDelivery] = useState(false);

  // ── notion card state ─────────────────────────────────────────────────────
  const [showReconnect, setShowReconnect] = useState(false);
  const [notionToken, setNotionToken] = useState("");
  const [notionDatabaseId, setNotionDatabaseId] = useState("");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState("");
  const [savingNotion, setSavingNotion] = useState(false);

  // ── account state ─────────────────────────────────────────────────────────
  const [signingOut, setSigningOut] = useState(false);

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/users/config");
        const data = await res.json();
        const cfg: Config = data.config ?? data;
        const prof: UserProfile = data.profile ?? null;

        setConfig(cfg);
        setUserProfile(prof);

        setProfileDesc(cfg.profile_description ?? "");
        setExperienceLevel(cfg.experience_level ?? "developer_learning_ai");
        setTopics(cfg.topics ?? []);
        setDigestHour(cfg.digest_hour ?? 7);
        setTimezoneOffset(cfg.timezone_offset ?? 0);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── toast helpers ─────────────────────────────────────────────────────────
  function showToast(message: string, type: Toast["type"]) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  // ── topic helpers ─────────────────────────────────────────────────────────
  function addTopic(raw: string) {
    const topic = raw.trim();
    if (!topic) return;
    if (topics.includes(topic)) {
      setTopicError("Topic already added.");
      return;
    }
    if (topics.length >= 5) {
      setTopicError("Maximum 5 topics for free tier.");
      return;
    }
    setTopics((t) => [...t, topic]);
    setTopicInput("");
    setTopicError("");
  }

  function removeTopic(topic: string) {
    setTopics((t) => t.filter((x) => x !== topic));
  }

  // ── save helpers ──────────────────────────────────────────────────────────
  async function patchConfig(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch("/api/users/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const ok = await patchConfig({
        profile_description: profileDesc,
        experience_level: experienceLevel,
        topics,
      });
      showToast(ok ? "Profile updated" : "Save failed — please try again.", ok ? "success" : "error");
    } catch {
      showToast("Network error — please try again.", "error");
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveDelivery() {
    setSavingDelivery(true);
    try {
      const ok = await patchConfig({ digest_hour: digestHour, timezone_offset: timezoneOffset });
      showToast(ok ? "Delivery settings saved" : "Save failed — please try again.", ok ? "success" : "error");
    } catch {
      showToast("Network error — please try again.", "error");
    } finally {
      setSavingDelivery(false);
    }
  }

  async function testConnection() {
    setConnectionStatus("testing");
    setConnectionError("");
    try {
      const res = await fetch("/api/users/test-notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionToken, notionDatabaseId }),
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

  async function saveNotion() {
    setSavingNotion(true);
    try {
      const ok = await patchConfig({
        notion_token: notionToken,
        notion_database_id: notionDatabaseId,
        notion_connected: true,
      });
      if (ok) {
        setConfig((c) => c ? { ...c, notion_connected: true, notion_database_id: notionDatabaseId } : c);
        setShowReconnect(false);
        setNotionToken("");
        setConnectionStatus("idle");
        showToast("Notion workspace connected", "success");
      } else {
        showToast("Save failed — please try again.", "error");
      }
    } catch {
      showToast("Network error — please try again.", "error");
    } finally {
      setSavingNotion(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut({ redirectUrl: "/" });
  }

  // ── loading skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {toast && (
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />
      )}

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        {/* Page title */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <Link
            href="/dashboard"
            className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
          >
            ← Dashboard
          </Link>
        </div>

        {/* ── CARD 1: Research profile ─────────────────────────────────────── */}
        <Card heading="Your research profile">
          <div className="space-y-6">
            {/* Profile description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                What you&apos;re building or learning
              </label>
              <textarea
                rows={4}
                value={profileDesc}
                onChange={(e) => setProfileDesc(e.target.value)}
                placeholder="e.g. I'm building a customer support chatbot using RAG. I have web development experience and I'm learning AI. I want papers I can build from immediately."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            {/* Experience level */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Your AI experience level
              </label>
              <div className="space-y-2.5">
                {EXPERIENCE_LEVELS.map(({ value, label }) => (
                  <label key={value} className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="experienceLevel"
                      value={value}
                      checked={experienceLevel === value}
                      onChange={() => setExperienceLevel(value)}
                      className="mt-0.5 accent-indigo-600"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Topics */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Topics
              </label>

              <div className="flex gap-2 mb-1">
                <input
                  type="text"
                  value={topicInput}
                  onChange={(e) => { setTopicInput(e.target.value); setTopicError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTopic(topicInput); } }}
                  placeholder="Add a topic"
                  disabled={topics.length >= 5}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
                />
                <button
                  onClick={() => addTopic(topicInput)}
                  disabled={topics.length >= 5}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-200 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  Add
                </button>
              </div>

              {topicError && (
                <p className="text-xs text-red-500 mb-2">{topicError}</p>
              )}

              {topics.length >= 5 && (
                <p className="text-xs text-amber-600 mb-2">
                  5/5 — upgrade to Pro for unlimited topics
                </p>
              )}

              {topics.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {topics.map((t) => (
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
            </div>

            <div className="pt-2">
              <SaveButton loading={savingProfile} onClick={saveProfile} label="Save profile" />
            </div>
          </div>
        </Card>

        {/* ── CARD 2: Delivery settings ─────────────────────────────────────── */}
        <Card heading="Digest delivery">
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                What time should your digest arrive?
              </label>
              <select
                value={digestHour}
                onChange={(e) => setDigestHour(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your timezone
              </label>
              <select
                value={timezoneOffset}
                onChange={(e) => setTimezoneOffset(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {TIMEZONES.map(({ label, offset }) => (
                  <option key={offset} value={offset}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-1">
              <SaveButton loading={savingDelivery} onClick={saveDelivery} label="Save delivery settings" />
            </div>
          </div>
        </Card>

        {/* ── CARD 3: Notion ────────────────────────────────────────────────── */}
        <Card heading="Notion workspace">
          {config?.notion_connected && !showReconnect ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-green-600 font-medium">Connected ✓</span>
              </div>
              {config.notion_database_id && (
                <p className="text-xs text-gray-400 font-mono">
                  Database ID: {config.notion_database_id.slice(0, 8)}…
                </p>
              )}
              <button
                onClick={() => { setShowReconnect(true); setConnectionStatus("idle"); }}
                className="text-sm border border-gray-300 hover:border-gray-400 text-gray-700 font-medium px-4 py-2 rounded-lg"
              >
                Reconnect Notion
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {config?.notion_connected && (
                <button
                  onClick={() => setShowReconnect(false)}
                  className="text-sm text-gray-400 hover:text-gray-600 mb-2"
                >
                  ← Cancel reconnect
                </button>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notion Integration Token
                </label>
                <input
                  type="password"
                  value={notionToken}
                  onChange={(e) => { setNotionToken(e.target.value); setConnectionStatus("idle"); }}
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
                  value={notionDatabaseId}
                  onChange={(e) => { setNotionDatabaseId(e.target.value); setConnectionStatus("idle"); }}
                  placeholder="32 character ID from the URL"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                onClick={testConnection}
                disabled={!notionToken || !notionDatabaseId || connectionStatus === "testing"}
                className="w-full border border-indigo-600 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 font-medium py-2.5 rounded-lg text-sm"
              >
                {connectionStatus === "testing" ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner /> Testing…
                  </span>
                ) : "Test connection"}
              </button>

              {connectionStatus === "success" && (
                <p className="text-sm text-green-600 flex items-center gap-1.5">
                  <span>✓</span> Connected successfully
                </p>
              )}
              {connectionStatus === "error" && (
                <p className="text-sm text-red-500">{connectionError}</p>
              )}

              <SaveButton
                loading={savingNotion}
                onClick={saveNotion}
                disabled={connectionStatus !== "success"}
                label="Save Notion connection"
              />
            </div>
          )}
        </Card>

        {/* ── CARD 4: Account ──────────────────────────────────────────────── */}
        <Card heading="Account">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Email</p>
                <p className="text-sm text-gray-700">
                  {userProfile?.email ?? "—"}
                </p>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  userProfile?.tier === "pro"
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {userProfile?.tier === "pro" ? "Pro" : "Free"}
              </span>
            </div>

            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex items-center gap-2 border border-gray-300 hover:border-gray-400 text-gray-700 font-medium text-sm px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {signingOut && <Spinner />}
              Sign out
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── shared sub-components ─────────────────────────────────────────────────────

function Card({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-5">{heading}</h2>
      {children}
    </div>
  );
}

function SaveButton({
  loading,
  onClick,
  label,
  disabled = false,
}: {
  loading: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-200 text-white font-medium text-sm px-5 py-2.5 rounded-lg"
    >
      {loading && <Spinner />}
      {label}
    </button>
  );
}
