import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How AI Digest handles your data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#f4f4f8] text-[#14141e]">

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 bg-[#f4f4f8]/90 backdrop-blur border-b border-black/[0.06] px-5 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-base tracking-tight text-[#14141e]">
          AI Digest
        </Link>
      </nav>

      <main className="max-w-2xl mx-auto px-5 py-16">
        <h1 className="text-3xl font-bold text-[#14141e] mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-12">Last updated: May 2025</p>

        <div className="space-y-10 text-sm text-gray-600 leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-[#14141e] mb-3">What we collect</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="font-medium text-[#14141e]">Account info</span> — your email address and name, used to identify your account and send service emails.</li>
              <li><span className="font-medium text-[#14141e]">Profile &amp; preferences</span> — your project description, experience level, topics, and digest delivery time, used solely to personalise your digest.</li>
              <li><span className="font-medium text-[#14141e]">Notion integration token &amp; database ID</span> — encrypted at the application layer (AES-256-GCM) before being stored in the database; used only to write your daily digest pages to your Notion workspace.</li>
              <li><span className="font-medium text-[#14141e]">Pipeline logs</span> — run timestamps and paper counts, used for debugging and delivery confirmation. No paper content is stored server-side.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#14141e] mb-3">What we never do</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>We never read any existing Notion content — the integration only writes to the database you share with it.</li>
              <li>We never sell or share your data with third parties for advertising or analytics.</li>
              <li>We never store paper summaries or AI outputs server-side beyond the pipeline run that generated them.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#14141e] mb-3">Third-party services</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="font-medium text-[#14141e]">Clerk</span> — authentication for email/password accounts. Clerk's own privacy policy applies to data processed through their service.</li>
              <li><span className="font-medium text-[#14141e]">Supabase</span> — database and storage. Data is stored in the EU (AWS eu-west-1) region by default.</li>
              <li><span className="font-medium text-[#14141e]">OpenAI</span> — used to summarise papers and score relevance during each pipeline run. Paper abstracts are sent to OpenAI's API; no personal data is included in these requests.</li>
              <li><span className="font-medium text-[#14141e]">Notion</span> — your integration token is used to write digest pages to your workspace via Notion's official API.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#14141e] mb-3">Data retention &amp; deletion</h2>
            <p>
              Your account data is retained for as long as your account is active. When you delete your
              account (via Clerk account settings), <span className="font-medium text-[#14141e]">all
              data associated with your account is permanently deleted</span> — including your profile,
              Notion credentials, topic preferences, pipeline run history, and the record of papers
              already delivered to you. This deletion is immediate and irreversible.
            </p>
            <p className="mt-3">
              You can also request manual deletion at any time by contacting us (see below), and we will
              remove your data within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#14141e] mb-3">Revoking Notion access</h2>
            <p>
              You can revoke AI Digest&apos;s access to your Notion workspace at any time by visiting{" "}
              <a
                href="https://www.notion.so/my-integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                notion.so/my-integrations
              </a>{" "}
              and removing the integration. This immediately invalidates the stored token.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#14141e] mb-3">Contact</h2>
            <p>
              Questions or deletion requests? Open an issue on{" "}
              <a
                href="https://github.com/sipandey/ai-digest-web"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                GitHub
              </a>{" "}
              or reach out directly via the repository.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white px-5 py-8 text-center flex items-center justify-center gap-6">
        <Link href="/" className="text-sm text-indigo-600 hover:underline">
          ← Back to AI Digest
        </Link>
        <Link href="/terms" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          Terms of Service
        </Link>
      </footer>
    </div>
  );
}
