"use client";

import { useEffect, useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import BottomNav from "@/components/BottomNav";
import { TIMEZONES, fmtRawOffset } from "@/lib/timezones";
import IntelligencePillar from "./settings/IntelligencePillar";
import SchedulePillar from "./settings/SchedulePillar";
import ChannelsPillar from "./settings/ChannelsPillar";
import AccountPillar from "./settings/AccountPillar";
import { Tab, FeedbackStats } from "./settings/types";

// ── types ─────────────────────────────────────────────────────────────────────

type ExperienceLevel =
  | "beginner"
  | "developer_learning_ai"
  | "practitioner"
  | "ml_engineer";

export type DigestLens = "builder" | "founder" | "researcher";

type Config = {
  profile_description: string;
  experience_level: ExperienceLevel;
  digest_lens?: DigestLens;
  topics: string[];
  digest_hour: number;
  timezone_offset: number;
  notion_connected: boolean;
  notion_database_id: string | null;
  email_digest_enabled?: boolean;
  delivery_email?: string | null;
  webhook_url?: string | null;
  webhook_platform?: "slack" | "discord" | "generic";
};

type UserProfile = {
  email: string | null;
  name: string | null;
  tier: "free" | "pro";
  authMethod: "clerk" | "notion";
};

type Toast = { message: string; type: "success" | "error" };
type ConnectionStatus = "idle" | "testing" | "success" | "error";

// ── constants ─────────────────────────────────────────────────────────────────

const DIGEST_LENSES: { value: DigestLens; label: string; sub: string; icon: string }[] = [
  { value: "builder", label: "Builder", sub: "Practical code, architectures & implementation takeaways", icon: "🛠️" },
  { value: "founder", label: "Founder", sub: "Market signals, consumer pain points & product opportunities", icon: "💡" },
  { value: "researcher", label: "Researcher", sub: "Deep-tech, theoretical novelty, mathematical rigor & claims", icon: "🔬" },
];

const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string; sub: string }[] = [
  { value: "beginner", label: "Complete beginner", sub: "Just starting with AI" },
  { value: "developer_learning_ai", label: "Developer learning AI", sub: "Know how to code, learning ML" },
  { value: "practitioner", label: "Practitioner", sub: "Building AI systems regularly" },
  { value: "ml_engineer", label: "ML Engineer", sub: "Training models, deep ML work" },
];

function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
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
  const [digestLens, setDigestLens] = useState<DigestLens>("builder");
  const [topics, setTopics] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState("");
  const [topicError, setTopicError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [digestHour, setDigestHour] = useState(7);
  const [timezoneOffset, setTimezoneOffset] = useState(0);
  const [savingDelivery, setSavingDelivery] = useState(false);

  const [emailDigestEnabled, setEmailDigestEnabled] = useState(false);
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookPlatform, setWebhookPlatform] = useState<"slack" | "discord" | "generic">("slack");
  const [savingChannels, setSavingChannels] = useState(false);

  const [showReconnect, setShowReconnect] = useState(false);
  const [notionToken, setNotionToken] = useState("");
  const [notionDatabaseId, setNotionDatabaseId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState("");
  const [savingNotion, setSavingNotion] = useState(false);

  const [signingOut, setSigningOut] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>("intelligence");
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null);
  const [resettingFeedback, setResettingFeedback] = useState(false);
  const [deliveryActive, setDeliveryActive] = useState(true);
  const [disconnectingNotion, setDisconnectingNotion] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [configRes, feedbackRes] = await Promise.all([
          fetch("/api/users/config"),
          fetch("/api/users/feedback"),
        ]);
        const data = await configRes.json();
        const cfg: Config = data.config ?? data;
        const prof: UserProfile = data.profile ?? null;
        setConfig(cfg);
        setUserProfile(prof);
        setProfileDesc(cfg.profile_description ?? "");
        setExperienceLevel(cfg.experience_level ?? "developer_learning_ai");
        setDigestLens((cfg.digest_lens as DigestLens) ?? "builder");
        setTopics(cfg.topics ?? []);
        setDigestHour(cfg.digest_hour ?? 7);
        setTimezoneOffset(Number(cfg.timezone_offset ?? 0));
        setDeliveryActive(cfg.active !== false);
        setEmailDigestEnabled(Boolean(cfg.email_digest_enabled));
        setDeliveryEmail(cfg.delivery_email ?? prof?.email ?? "");
        setWebhookUrl(cfg.webhook_url ?? "");
        setWebhookPlatform(cfg.webhook_platform ?? "slack");

        if (feedbackRes.ok) {
          const feedbackData = await feedbackRes.json();
          if (feedbackData.stats) {
            setFeedbackStats(feedbackData.stats);
          }
        }
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
      const ok = await patchConfig({
        profile_description: profileDesc,
        experience_level: experienceLevel,
        digest_lens: digestLens,
        topics,
      });
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
      } else {
        showToast("Save failed — please try again.", "error");
      }
    } catch {
      showToast("Network error — please try again.", "error");
    } finally {
      setSavingNotion(false);
    }
  }

  async function handleResetFeedback() {
    setResettingFeedback(true);
    try {
      const res = await fetch("/api/users/feedback?all=true", { method: "DELETE" });
      if (res.ok) {
        setFeedbackStats({ total: 0, more: 0, less: 0 });
        showToast("AI memory preferences reset", "success");
      } else {
        showToast("Failed to reset feedback", "error");
      }
    } catch {
      showToast("Network error — please try again.", "error");
    } finally {
      setResettingFeedback(false);
    }
  }

  async function handleSaveNotion(token: string, dbId: string): Promise<boolean> {
    setSavingNotion(true);
    try {
      const ok = await patchConfig({ notion_token: token, notion_database_id: dbId, notion_connected: true });
      if (ok) {
        setConfig((c) => (c ? { ...c, notion_connected: true, notion_database_id: dbId } : c));
        showToast("Notion workspace connected", "success");
        return true;
      } else {
        showToast("Save failed — check credentials.", "error");
        return false;
      }
    } catch {
      showToast("Network error — please try again.", "error");
      return false;
    } finally {
      setSavingNotion(false);
    }
  }

  async function handleDisconnectNotion() {
    setDisconnectingNotion(true);
    try {
      const ok = await patchConfig({ disconnectNotion: true });
      if (ok) {
        setConfig((c) => (c ? { ...c, notion_connected: false, notion_database_id: null } : c));
        showToast("Notion workspace disconnected", "success");
      } else {
        showToast("Failed to disconnect Notion.", "error");
      }
    } catch {
      showToast("Network error — please try again.", "error");
    } finally {
      setDisconnectingNotion(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      if (userProfile?.authMethod === "notion") {
        // Guest users have no Clerk session — clear the __digest_sid cookie via
        // our own logout endpoint, then redirect to the landing page.
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/";
      } else {
        // Clerk users: Clerk's signOut handles everything.
        await signOut({ redirectUrl: "/" });
      }
    } finally {
      setSigningOut(false);
    }
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

        {/* ── 4-Pillar Tabs Navigation ─────────────────────────────────────── */}
        <div className="flex border-b border-gray-200 overflow-x-auto no-scrollbar gap-2 sm:gap-4">
          {[
            { id: "intelligence", label: "🧠 Intelligence" },
            { id: "schedule", label: "⏰ Schedule" },
            { id: "channels", label: "📡 Channels" },
            { id: "account", label: "👤 Account" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`pb-3 px-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Pillars Content */}
        {activeTab === "intelligence" && (
          <IntelligencePillar
            digestLens={digestLens}
            setDigestLens={setDigestLens}
            topics={topics}
            setTopics={setTopics}
            profileDesc={profileDesc}
            setProfileDesc={setProfileDesc}
            experienceLevel={experienceLevel}
            setExperienceLevel={setExperienceLevel}
            feedbackStats={feedbackStats}
            onResetFeedback={handleResetFeedback}
            resettingFeedback={resettingFeedback}
          />
        )}

        {activeTab === "schedule" && (
          <SchedulePillar
            deliveryActive={deliveryActive}
            setDeliveryActive={setDeliveryActive}
            digestHour={digestHour}
            setDigestHour={setDigestHour}
            timezoneOffset={timezoneOffset}
            setTimezoneOffset={setTimezoneOffset}
          />
        )}

        {activeTab === "channels" && (
          <ChannelsPillar
            config={config}
            emailDigestEnabled={emailDigestEnabled}
            setEmailDigestEnabled={setEmailDigestEnabled}
            deliveryEmail={deliveryEmail}
            setDeliveryEmail={setDeliveryEmail}
            webhookUrl={webhookUrl}
            setWebhookUrl={setWebhookUrl}
            webhookPlatform={webhookPlatform}
            setWebhookPlatform={setWebhookPlatform}
            onSaveNotion={handleSaveNotion}
            onDisconnectNotion={handleDisconnectNotion}
            savingNotion={savingNotion}
            disconnectingNotion={disconnectingNotion}
          />
        )}

        {activeTab === "account" && (
          <AccountPillar
            userProfile={userProfile}
            onSignOut={handleSignOut}
            signingOut={signingOut}
          />
        )}

        {/* ── NOTION WORKSPACE ───────────────────────────────────────────── */}
        {false && (
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
              {/* Capability reminder */}
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-500 shrink-0 mt-0.5">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Your integration must have <span className="font-semibold">Read content</span>,{" "}
                  <span className="font-semibold">Insert content</span>, and{" "}
                  <span className="font-semibold">Update content</span> capabilities enabled — all three are required.
                </p>
              </div>
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
        )}

        {/* ── ACCOUNT ────────────────────────────────────────────────────── */}
        {false && (
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
        )}
      </div>

      <BottomNav active="settings" />
    </div>
  );
}
