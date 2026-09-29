"use client";

import { useEffect, useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import BottomNav from "@/components/BottomNav";
import {
  Config,
  UserProfile,
  FeedbackStats,
  Toast,
  Tab,
  DigestLens,
  ExperienceLevel,
} from "./settings/types";
import IntelligencePillar from "./settings/IntelligencePillar";
import SchedulePillar from "./settings/SchedulePillar";
import ChannelsPillar from "./settings/ChannelsPillar";
import AccountPillar from "./settings/AccountPillar";

function Skeleton({ className }: { className: string }) {
  return <div className={`bg-gray-200 rounded-xl animate-pulse ${className}`} />;
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
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg text-sm font-medium ${
        toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
      }`}
    >
      <span>{toast.message}</span>
      <button onClick={onDismiss} className="opacity-70 hover:opacity-100 text-lg leading-none cursor-pointer">×</button>
    </div>
  );
}

export default function SettingsView() {
  const { signOut } = useClerk();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("intelligence");
  const [config, setConfig] = useState<Config | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null);
  const [resettingFeedback, setResettingFeedback] = useState(false);

  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form Fields
  const [profileDesc, setProfileDesc] = useState("");
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>("developer_learning_ai");
  const [digestLens, setDigestLens] = useState<DigestLens>("builder");
  const [topics, setTopics] = useState<string[]>([]);

  const [digestHour, setDigestHour] = useState(7);
  const [timezoneOffset, setTimezoneOffset] = useState(0);
  const [deliveryActive, setDeliveryActive] = useState(true);

  const [emailDigestEnabled, setEmailDigestEnabled] = useState(false);
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookPlatform, setWebhookPlatform] = useState<"slack" | "discord" | "generic">("slack");

  const [savingNotion, setSavingNotion] = useState(false);
  const [disconnectingNotion, setDisconnectingNotion] = useState(false);

  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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

  // ── Dirty State Calculation ──────────────────────────────────────────────────
  const isDirty = config !== null && (
    profileDesc !== (config.profile_description ?? "") ||
    experienceLevel !== (config.experience_level ?? "developer_learning_ai") ||
    digestLens !== ((config.digest_lens as DigestLens) ?? "builder") ||
    JSON.stringify(topics) !== JSON.stringify(config.topics ?? []) ||
    digestHour !== (config.digest_hour ?? 7) ||
    timezoneOffset !== Number(config.timezone_offset ?? 0) ||
    deliveryActive !== (config.active !== false) ||
    emailDigestEnabled !== Boolean(config.email_digest_enabled) ||
    deliveryEmail !== (config.delivery_email ?? userProfile?.email ?? "") ||
    webhookUrl !== (config.webhook_url ?? "") ||
    webhookPlatform !== (config.webhook_platform ?? "slack")
  );

  function discardChanges() {
    if (!config) return;
    setProfileDesc(config.profile_description ?? "");
    setExperienceLevel(config.experience_level ?? "developer_learning_ai");
    setDigestLens((config.digest_lens as DigestLens) ?? "builder");
    setTopics(config.topics ?? []);
    setDigestHour(config.digest_hour ?? 7);
    setTimezoneOffset(Number(config.timezone_offset ?? 0));
    setDeliveryActive(config.active !== false);
    setEmailDigestEnabled(Boolean(config.email_digest_enabled));
    setDeliveryEmail(config.delivery_email ?? userProfile?.email ?? "");
    setWebhookUrl(config.webhook_url ?? "");
    setWebhookPlatform(config.webhook_platform ?? "slack");
    showToast("Changes discarded", "success");
  }

  async function patchConfig(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch("/api/users/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  }

  async function saveAllChanges() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        profile_description: profileDesc,
        experience_level: experienceLevel,
        digest_lens: digestLens,
        topics,
        digest_hour: digestHour,
        timezone_offset: timezoneOffset,
        active: deliveryActive,
        email_digest_enabled: emailDigestEnabled,
        delivery_email: deliveryEmail,
        webhook_url: webhookUrl,
        webhook_platform: webhookPlatform,
      };

      const ok = await patchConfig(payload);
      if (ok) {
        setConfig((c) => (c ? { ...c, ...payload } : null));
        showToast("All changes saved successfully", "success");
      } else {
        showToast("Failed to save changes — check your fields.", "error");
      }
    } catch {
      showToast("Network error — please try again.", "error");
    } finally {
      setSaving(false);
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
        setConfig((c) => c ? { ...c, notion_connected: true, notion_database_id: dbId } : c);
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
        setConfig((c) => c ? { ...c, notion_connected: false, notion_database_id: null } : c);
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
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/";
      } else {
        await signOut({ redirectUrl: "/" });
      }
    } finally {
      setSigningOut(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f4f8]">
        <div className="max-w-3xl mx-auto px-4 pt-12 pb-24 space-y-6">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
        <BottomNav active="settings" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f4f8]">
      {toast && <ToastBanner toast={toast} onDismiss={() => setToast(null)} />}

      <div className="max-w-3xl mx-auto px-4 pt-10 pb-36 space-y-6">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">
            Research Intelligence
          </p>
          <h1 className="text-2xl font-bold text-[#14141e]">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your AI synthesis lens, delivery schedule, connected export channels, and account.
          </p>
        </div>

        {/* 4-Pillar Tabs */}
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
      </div>

      {/* Unified Sticky Save Bar */}
      {isDirty && (
        <div className="fixed bottom-20 sm:bottom-8 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="bg-[#14141e] text-white p-4 rounded-2xl shadow-2xl border border-gray-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <p className="text-xs sm:text-sm font-medium">You have unsaved changes</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={discardChanges}
                disabled={saving}
                className="text-xs text-gray-400 hover:text-white px-3 py-1.5 transition-colors cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={saveAllChanges}
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                {saving && <Spinner />}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav active="settings" />
    </div>
  );
}
