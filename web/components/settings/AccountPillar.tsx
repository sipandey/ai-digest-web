"use client";

import { UserProfile } from "./types";
import { getBookmarks } from "@/lib/bookmarks";
import { useState } from "react";

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export default function AccountPillar({
  userProfile,
  onSignOut,
  signingOut,
  onDeleteAccount,
  deletingAccount,
}: {
  userProfile: UserProfile | null;
  onSignOut: () => Promise<void>;
  signingOut: boolean;
  onDeleteAccount: () => Promise<void>;
  deletingAccount: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function downloadExport() {
    setExporting(true);
    setExportError(null);
    try {
      const response = await fetch("/api/users/export");
      if (!response.ok) throw new Error("Could not export account data.");
      const payload = await response.json() as Record<string, unknown>;
      const blob = new Blob(
        [JSON.stringify({ ...payload, browser_bookmarks: getBookmarks() }, null, 2)],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ai-digest-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-5">
        <h2 className="text-sm font-semibold text-[#14141e]">Account Profile</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-gray-400 mb-0.5">Email</p>
            <p className="font-semibold text-gray-800">{userProfile?.email ?? "—"}</p>
          </div>
          <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-gray-400 mb-0.5">Authentication Provider</p>
            <p className="font-semibold text-gray-800 capitalize">{userProfile?.authMethod ?? "Clerk"}</p>
          </div>
        </div>

        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider">Current Plan</span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-600 text-white">Free Plan</span>
          </div>
          <p className="text-xs text-indigo-700 leading-relaxed mb-3">
            Includes scheduled digests when enabled and shared pilot capacity is available, customizable lens scoring, and saved in-app history.
          </p>
          <div className="text-[11px] text-indigo-600 space-y-1 font-medium">
            <p>✓ Read saved digests anytime</p>
            <p>✓ One manual run per UTC day during the free pilot</p>
            <p>✓ Multi-channel export (Email, Notion, Slack, Discord)</p>
            <p>✓ Dynamic feedback personalization loop</p>
          </div>
        </div>

        <div className="pt-2 border-t border-gray-100 space-y-3">
          <div>
            <p className="text-sm font-semibold text-[#14141e]">Your data</p>
            <p className="text-xs text-gray-500 mt-1">Export your profile, preferences, feedback, saved digest history, and run records as JSON.</p>
          </div>
          <button
            type="button"
            onClick={() => void downloadExport()}
            disabled={exporting}
            className="border border-gray-200 hover:border-indigo-300 text-gray-700 font-semibold text-xs px-4 py-2.5 rounded-xl disabled:opacity-50 transition-colors"
          >
            {exporting ? "Preparing export…" : "Download my data"}
          </button>
          {exportError && <p role="alert" className="text-xs text-red-600">{exportError}</p>}
        </div>

        <div className="pt-2 border-t border-red-100 space-y-3">
          <div>
            <p className="text-sm font-semibold text-red-700">Delete account</p>
            <p className="text-xs text-gray-500 mt-1">Permanently deletes your AI Digest data and sign-in. Pages already in Notion and bookmarks in this browser remain.</p>
          </div>
          <button
            type="button"
            disabled={deletingAccount}
            onClick={() => {
              if (window.confirm("Permanently delete your AI Digest account and all saved digests? This cannot be undone.")) {
                void onDeleteAccount();
              }
            }}
            className="border border-red-200 hover:border-red-400 text-red-600 font-semibold text-xs px-4 py-2.5 rounded-xl disabled:opacity-50 transition-colors"
          >
            {deletingAccount ? "Deleting account…" : "Delete account"}
          </button>
        </div>
        <div className="pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="flex items-center gap-2 border border-red-200 hover:border-red-300 text-red-500 hover:text-red-600 font-semibold text-xs px-4 py-2.5 rounded-xl disabled:opacity-40 transition-colors cursor-pointer"
          >
            {signingOut && <Spinner />}
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
