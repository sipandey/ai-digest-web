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

const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string; sub: string }[] = [
  { value: "beginner", label: "Complete beginner", sub: "Just starting with AI" },
  { value: "developer_learning_ai", label: "Developer learning AI", sub: "Know how to code, learning ML" },
  { value: "practitioner", label: "Practitioner", sub: "Building AI systems regularly" },
  { value: "ml_engineer", label: "ML Engineer", sub: "Training models, deep ML work" },
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

function computeUtcHour(digestHour: number, timezoneOffset: number): number {
  return ((digestHour - timezoneOffset) % 24 + 24) % 24;
}

function padHour(h: number): string {
  return String(h).padStart(2, "0") + ":00";
}

// ── shared primitives ─────────────────────────────────────────────────────────

function Skeleton({ className }: { className: string }) {
  return (
    <div className={`bg-gray-200 rounded-xl animate-pulse ${className}`} />
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

function ToastBanner({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg text-sm font-medium ${
        toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
      }`}
    >
      <span>{toast.message}</span>
      <button onClick={onDismiss} className="opacity-70 hover:opacity-100 text-lg leading-none">×</button>
    </div>
  );
}

function SectionCard({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          {heading}
        </h2>
      </div>
      <div className="p-5">{children}</div>
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
      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-30 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
    >
      {loading && <Spinner />}
      {label}
    </button>
  );
}

// ── bottom nav ────────────────────────────────────────────────────────────────

function BottomNav({ active }: { active: "dashboard" | "settings" }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 h-16 bg-white/95 backdrop-blur border-t border-gray-200 flex">
      <Link
        href="/dashboard"
        className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
          active === "dashboard" ? "text-indigo-600" : "text-gray-400 hover:text-gray-600"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
          <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" />
        </svg>
        <span className="text-[10px] font-medium">Today</span>
      </Link>
      <Link
        href="/settings"
        className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
          active === "settings" ? "text-indigo-600" : "text-gray-400 hover:text-gray-600"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" />
        </svg>
        <span className="text-[10px] font-medium">Settings</span>
      </Link>
    </nav>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function SettingsView() {
  const { signOut } = useClerk();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Config | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [profileDesc, setProfileDesc] = useState("");
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>("developer_learning_ai");
  const [topics, setTopics] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState("");
  const [topicError, setTopicError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [digestHour, setDigestHour] = useState(7);
  const [timezoneOffset, setTimezoneOffset] = useState(0);
  const [savingDelivery, setSavingDelivery] = useState(false);

  const [showReconnect, setShowReconnect] = useState(false);
  const [notionToken, setNotionToken] = useState("");
  const [notionDatabaseId, setNotionDatabaseId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState("");
  const [savingNotion, setSavingNotion] = useState(false);

  const [signingOut, setSigningOut] = useState(false);

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

  function showToast(message: string, type: Toast["type"]) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  function addTopic(raw: string) {
    const topic = raw.trim();
    if (!topic) return;
    if (topics.includes(topic)) { setTopicError("Already added."); return; }
    if (topics.length >= 5) { setTopicError("Maximum 5 topics."); return; }
    setTopics((t) => [...t, topic]);
    setTopicInput("");
    setTopicError("");
  }

  function removeTopic(topic: string) {
    setTopics((t) => t.filter((x) => x !== topic));
  }

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
      const ok = await patchConfig({ profile_description: profileDesc, experience_level: experienceLevel, topics });
      showToast(ok ? "Profile saved" : "Save failed — please try again.", ok ? "success" : "error");
    } catch { showToast("Network error — please try again.", "error"); }
    finally { setSavingProfile(false); }
  }

  async function saveDelivery() {
    setSavingDelivery(true);
    try {
      const ok = await patchConfig({ digest_hour: digestHour, timezone_offset: timezoneOffset });
      showToast(ok ? "Delivery settings saved" : "Save failed.", ok ? "success" : "error");
    } catch { showToast("Network error — please try again.", "error"); }
    finally { setSavingDelivery(false); }
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
      const ok = await patchConfig({ notion_token: notionToken, notion_database_id: notionDatabaseId, notion_connected: true });
      if (ok) {
        setConfig((c) => c ? { ...c, notion_connected: true, notion_database_id: notionDatabaseId } : c);
        setShowReconnect(false);
        setNotionToken("");
        setConnectionStatus("idle");
        showToast("Notion workspace connected", "success");
      } else {
        showToast("Save failed — please try again.", "error");
      }
    } catch { showToast("Network error — please try again.", "error"); }
    finally { setSavingNotion(false); }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut({ redirectUrl: "/" });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f4f8]">
        <div className="max-w-[480px] mx-auto px-4 pt-12 pb-24 space-y-4">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <BottomNav active="settings" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f4f8]">
      {toast && <ToastBanner toast={toast} onDismiss={() => setToast(null)} />}

      <div className="max-w-[480px] mx-auto px-4 pt-12 pb-24 space-y-4">

        {/* Page heading */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">
            AI Digest
          </p>
          <h1 className="text-2xl font-bold text-[#14141e]">Settings</h1>
        </div>

        {/* ── RESEARCH PROFILE ───────────────────────────────────────────── */}
        <SectionCard heading="Research profile">
          <div className="space-y-6">

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                What you&apos;re building or learning
              </label>
              <textarea
                rows={4}
                value={profileDesc}
                onChange={(e) => setProfileDesc(e.target.value)}
                placeholder="e.g. I'm building a customer support chatbot using RAG. I have web dev experience and I'm learning AI."
                className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm text-[#14141e] placeholder:text-gray-300 focus:outline-none resize-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Experience level
              </label>
              <div className="space-y-2">
                {EXPERIENCE_LEVELS.map(({ value, label, sub }) => (
                  <label
                    key={value}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                      experienceLevel === value
                        ? "border-indigo-400 bg-indigo-50"
                        : "border-gray-200 hover:border-gray-300 bg-gray-50/50"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      experienceLevel === value ? "border-indigo-500" : "border-gray-300"
                    }`}>
                      {experienceLevel === value && (
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
                      checked={experienceLevel === value}
                      onChange={() => setExperienceLevel(value)}
                      className="sr-only"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Topics
              </label>
              <div className="flex gap-2 mb-1.5">
                <input
                  type="text"
                  value={topicInput}
                  onChange={(e) => { setTopicInput(e.target.value); setTopicError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTopic(topicInput); } }}
                  placeholder="Add a topic"
                  disabled={topics.length >= 5}
                  className="flex-1 bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-2.5 text-sm text-[#14141e] placeholder:text-gray-300 focus:outline-none disabled:opacity-40 transition-colors"
                />
                <button
                  onClick={() => addTopic(topicInput)}
                  disabled={topics.length >= 5}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shrink-0"
                >
                  Add
                </button>
              </div>
              {topicError && <p className="text-xs text-red-500 mb-2">{topicError}</p>}
              {topics.length >= 5 && (
                <p className="text-xs text-amber-600 mb-2">5 topics maximum</p>
              )}
              {topics.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {topics.map((t) => (
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
            </div>

            <div className="pt-1">
              <SaveButton loading={savingProfile} onClick={saveProfile} label="Save profile" />
            </div>
          </div>
        </SectionCard>

        {/* ── DELIVERY SETTINGS ──────────────────────────────────────────── */}
        <SectionCard heading="Digest delivery">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Delivery time
              </label>
              <select
                value={digestHour}
                onChange={(e) => setDigestHour(Number(e.target.value))}
                className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm text-[#14141e] focus:outline-none transition-colors"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{formatHour(h)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Timezone
              </label>
              <select
                value={timezoneOffset}
                onChange={(e) => setTimezoneOffset(Number(e.target.value))}
                className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm text-[#14141e] focus:outline-none transition-colors"
              >
                {TIMEZONES.map(({ label, offset }) => (
                  <option key={offset} value={offset}>{label}</option>
                ))}
              </select>
            </div>

            {/* Live UTC delivery-time hint */}
            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-indigo-400 shrink-0">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
              </svg>
              <p className="text-xs text-indigo-700">
                Digest will be delivered at{" "}
                <span className="font-semibold">
                  {padHour(computeUtcHour(digestHour, timezoneOffset))} UTC
                </span>
                {" "}each day
              </p>
            </div>

            <div className="pt-1">
              <SaveButton loading={savingDelivery} onClick={saveDelivery} label="Save delivery settings" />
            </div>
          </div>
        </SectionCard>

        {/* ── NOTION WORKSPACE ───────────────────────────────────────────── */}
        <SectionCard heading="Notion workspace">
          {config?.notion_connected && !showReconnect ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-sm font-medium text-emerald-600">Connected</span>
              </div>
              {config.notion_database_id && (
                <p className="text-xs text-gray-400 font-mono">
                  Database: {config.notion_database_id.slice(0, 8)}…
                </p>
              )}
              <button
                onClick={() => { setShowReconnect(true); setConnectionStatus("idle"); }}
                className="text-sm border border-gray-200 hover:border-gray-300 text-gray-600 font-medium px-4 py-2.5 rounded-xl transition-colors"
              >
                Reconnect Notion
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {config?.notion_connected && (
                <button
                  onClick={() => setShowReconnect(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ← Cancel reconnect
                </button>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Integration Token
                </label>
                <input
                  type="password"
                  value={notionToken}
                  onChange={(e) => { setNotionToken(e.target.value); setConnectionStatus("idle"); }}
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
                  value={notionDatabaseId}
                  onChange={(e) => { setNotionDatabaseId(e.target.value); setConnectionStatus("idle"); }}
                  placeholder="32 character ID from the URL"
                  className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm font-mono text-[#14141e] placeholder:text-gray-300 focus:outline-none transition-colors"
                />
              </div>
              <button
                onClick={testConnection}
                disabled={!notionToken || !notionDatabaseId || connectionStatus === "testing"}
                className="w-full border border-indigo-400 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 font-medium py-3 rounded-xl text-sm transition-colors"
              >
                {connectionStatus === "testing" ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner /> Testing…
                  </span>
                ) : "Test connection"}
              </button>
              {connectionStatus === "success" && (
                <p className="text-sm text-emerald-600 flex items-center gap-2">
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
        </SectionCard>

        {/* ── ACCOUNT ────────────────────────────────────────────────────── */}
        <SectionCard heading="Account">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Email</p>
                <p className="text-sm text-gray-700">{userProfile?.email ?? "—"}</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
                Free
              </span>
            </div>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex items-center gap-2 border border-red-200 hover:border-red-300 text-red-500 hover:text-red-600 font-medium text-sm px-4 py-2.5 rounded-xl disabled:opacity-40 transition-colors"
            >
              {signingOut && <Spinner />}
              Sign out
            </button>
          </div>
        </SectionCard>
      </div>

      <BottomNav active="settings" />
    </div>
  );
}
