"use client";

import { UserProfile } from "./types";

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
}: {
  userProfile: UserProfile | null;
  onSignOut: () => Promise<void>;
  signingOut: boolean;
}) {
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
            Includes daily automated AI digests, customizable lens scoring, and full in-app archive viewing.
          </p>
          <div className="text-[11px] text-indigo-600 space-y-1 font-medium">
            <p>✓ Unlimited daily in-app digest reading</p>
            <p>✓ Multi-channel export (Email, Notion, Slack, Discord)</p>
            <p>✓ Dynamic feedback personalization loop</p>
          </div>
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
