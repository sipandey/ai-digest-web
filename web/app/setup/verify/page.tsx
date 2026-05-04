"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VerifyPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setStatus("loading");
    setError("");

    try {
      const res = await fetch("/api/guest/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionToken: token }),
      });

      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error ??
            "Could not verify. Check your token and try again.",
        );
        setStatus("error");
      }
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f4f8] flex flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <span className="font-bold text-xl tracking-tight text-[#14141e]">AI Digest</span>
      </div>

      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-black/[0.06] p-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[#14141e]">Continue to your digest</h1>
          <p className="text-sm text-gray-500 mt-1">
            Enter your Notion integration token to pick up where you left off.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Notion integration token
            </label>
            <input
              type="password"
              placeholder="secret_…"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setStatus("idle");
                setError("");
              }}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={!token.trim() || status === "loading"}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-2xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {status === "loading" ? (
              <>
                <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                Verifying…
              </>
            ) : (
              "Continue to my digest →"
            )}
          </button>
        </form>

        <div className="border-t border-gray-100 pt-4 text-center space-y-2">
          <p className="text-xs text-gray-400">
            Don't have an account?{" "}
            <a href="/setup" className="text-indigo-600 hover:underline">
              Set up with Notion
            </a>
          </p>
          <p className="text-xs text-gray-400">
            Have an email account?{" "}
            <a href="/login" className="text-indigo-600 hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
