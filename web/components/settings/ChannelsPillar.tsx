"use client";

import { useState } from "react";
import { Config } from "./types";

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export default function ChannelsPillar({
  config,
  emailDigestEnabled,
  setEmailDigestEnabled,
  deliveryEmail,
  setDeliveryEmail,
  webhookUrl,
  setWebhookUrl,
  webhookPlatform,
  setWebhookPlatform,
  onSaveNotion,
  onDisconnectNotion,
  savingNotion,
  disconnectingNotion,
}: {
  config: Config | null;
  emailDigestEnabled: boolean;
  setEmailDigestEnabled: (e: boolean) => void;
  deliveryEmail: string;
  setDeliveryEmail: (e: string) => void;
  webhookUrl: string;
  setWebhookUrl: (u: string) => void;
  webhookPlatform: "slack" | "discord" | "generic";
  setWebhookPlatform: (p: "slack" | "discord" | "generic") => void;
  onSaveNotion: (token: string, dbId: string) => Promise<boolean>;
  onDisconnectNotion: () => Promise<void>;
  savingNotion: boolean;
  disconnectingNotion: boolean;
}) {
  const [webhookTestStatus, setWebhookTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [webhookTestMsg, setWebhookTestMsg] = useState("");

  const [showReconnect, setShowReconnect] = useState(false);
  const [notionToken, setNotionToken] = useState("");
  const [notionDatabaseId, setNotionDatabaseId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [connectionError, setConnectionError] = useState("");

  async function testWebhook() {
    if (!webhookUrl) return;
    setWebhookTestStatus("testing");
    setWebhookTestMsg("");
    try {
      const res = await fetch("/api/users/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl, webhookPlatform }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWebhookTestStatus("success");
        setWebhookTestMsg("Test ping received successfully!");
      } else {
        setWebhookTestStatus("error");
        setWebhookTestMsg(data.error ?? "Webhook connection failed.");
      }
    } catch {
      setWebhookTestStatus("error");
      setWebhookTestMsg("Network error connecting to webhook.");
    }
  }

  async function testNotionConnection() {
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

  async function handleSaveNotion() {
    const ok = await onSaveNotion(notionToken, notionDatabaseId);
    if (ok) {
      setShowReconnect(false);
      setNotionToken("");
      setConnectionStatus("idle");
    }
  }

  return (
    <div className="space-y-6">
      {/* Core Web Dashboard */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-lg">
            💻
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[#14141e]">In-App Web Dashboard</h2>
              <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Core Hub</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Read papers, search takeaways, and rate recommendations anytime.</p>
          </div>
        </div>
        <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Always Active
        </span>
      </div>

      {/* Daily Email Digest */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-lg">
              📬
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#14141e]">Daily Email Digest</h2>
              <p className="text-xs text-gray-500 mt-0.5">Morning research briefing delivered directly to your inbox.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEmailDigestEnabled(!emailDigestEnabled)}
            className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
              emailDigestEnabled ? "bg-indigo-600" : "bg-gray-300"
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                emailDigestEnabled ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {emailDigestEnabled && (
          <div className="pt-2">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Delivery Email Address
            </label>
            <input
              type="email"
              value={deliveryEmail}
              onChange={(e) => setDeliveryEmail(e.target.value)}
              placeholder="you@domain.com"
              className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-2.5 text-sm text-[#14141e] focus:outline-none transition-colors"
            />
          </div>
        )}
      </div>

      {/* Slack / Discord Webhook */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-lg">
            💬
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#14141e]">Team Chat Webhook</h2>
            <p className="text-xs text-gray-500 mt-0.5">Automatically publish formatted daily digests to Slack or Discord channels.</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Target Platform
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["slack", "discord", "generic"] as const).map((plat) => (
              <button
                key={plat}
                type="button"
                onClick={() => setWebhookPlatform(plat)}
                className={`py-2 px-3 rounded-xl border text-xs font-medium capitalize transition-colors cursor-pointer ${
                  webhookPlatform === plat
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700 font-semibold"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {plat}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Webhook URL
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => { setWebhookUrl(e.target.value); setWebhookTestStatus("idle"); }}
              placeholder="https://hooks.slack.com/services/... or https://discord.com/api/webhooks/..."
              className="flex-1 bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-2.5 text-xs font-mono text-[#14141e] placeholder:text-gray-400 focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={testWebhook}
              disabled={!webhookUrl || webhookTestStatus === "testing"}
              className="border border-indigo-400 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              {webhookTestStatus === "testing" ? <><Spinner /> Testing</> : "Test Ping"}
            </button>
          </div>
          {webhookTestStatus === "success" && (
            <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
              <span>✓</span> {webhookTestMsg}
            </p>
          )}
          {webhookTestStatus === "error" && (
            <p className="text-xs text-red-500 mt-2">{webhookTestMsg}</p>
          )}
        </div>
      </div>

      {/* Notion Workspace */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-lg">
              📓
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#14141e]">Notion Workspace</h2>
              <p className="text-xs text-gray-500 mt-0.5">Export structured digest pages directly into your Notion database.</p>
            </div>
          </div>
          {config?.notion_connected ? (
            <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Connected
            </span>
          ) : (
            <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
              Not Connected
            </span>
          )}
        </div>

        {config?.notion_connected && !showReconnect ? (
          <div className="pt-2 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs text-gray-400">Connected Database</p>
              <p className="text-xs font-mono font-medium text-gray-700">
                {config.notion_database_id ? `${config.notion_database_id.slice(0, 8)}…` : "Active"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowReconnect(true)}
                className="text-xs border border-gray-200 hover:border-gray-300 text-gray-700 font-medium px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
              >
                Reconnect
              </button>
              <button
                type="button"
                onClick={onDisconnectNotion}
                disabled={disconnectingNotion}
                className="text-xs border border-red-200 hover:border-red-300 text-red-600 font-medium px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
              >
                {disconnectingNotion ? "Disconnecting…" : "Disconnect Notion"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-2 border-t border-gray-100">
            {config?.notion_connected && (
              <button
                type="button"
                onClick={() => setShowReconnect(false)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                ← Keep current connection
              </button>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Integration Secret
                </label>
                <input
                  type="password"
                  value={notionToken}
                  onChange={(e) => { setNotionToken(e.target.value); setConnectionStatus("idle"); }}
                  placeholder="secret_xxxxxxxxxxxx"
                  className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-2.5 text-xs font-mono text-[#14141e] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Database ID
                </label>
                <input
                  type="text"
                  value={notionDatabaseId}
                  onChange={(e) => { setNotionDatabaseId(e.target.value); setConnectionStatus("idle"); }}
                  placeholder="32 character ID or full Notion URL"
                  className="w-full bg-[#f4f4f8] border border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-2.5 text-xs font-mono text-[#14141e] focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={testNotionConnection}
                disabled={!notionToken || !notionDatabaseId || connectionStatus === "testing"}
                className="border border-indigo-400 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 font-medium py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {connectionStatus === "testing" ? <><Spinner /> Testing</> : "Test Connection"}
              </button>
              {connectionStatus === "success" && (
                <button
                  type="button"
                  onClick={handleSaveNotion}
                  disabled={savingNotion}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {savingNotion && <Spinner />} Save Notion
                </button>
              )}
            </div>
            {connectionStatus === "success" && (
              <p className="text-xs text-emerald-600 flex items-center gap-1"><span>✓</span> Credentials verified</p>
            )}
            {connectionStatus === "error" && (
              <p className="text-xs text-red-500">{connectionError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
