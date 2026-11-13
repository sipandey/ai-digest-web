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
        <p className="text-sm text-gray-400 mb-12">Last updated: November 13, 2026</p>

        <div className="space-y-10 text-sm text-gray-600 leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-[#14141e] mb-3">What we collect</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="font-medium text-[#14141e]">Account info</span> — your email address and name, used to identify your account and send service emails.</li>
              <li><span className="font-medium text-[#14141e]">Profile &amp; preferences</span> — your project description, experience level, topics, lens, and digest delivery time, used by AI Digest and OpenAI to personalize your digest.</li>
              <li><span className="font-medium text-[#14141e]">Notion integration token &amp; database ID</span> — encrypted at the application layer (AES-256-GCM) before being stored in the database; used only to write your daily digest pages to your Notion workspace.</li>
              <li><span className="font-medium text-[#14141e]">Digest and run history</span> — generated paper summaries and relevance scores are stored in your account so you can reopen previous results. Run timestamps, counts, and statuses are also stored.</li>
              <li><span className="font-medium text-[#14141e]">Saved papers</span> — bookmarks are stored in this browser&apos;s local storage and do not sync across devices. An export includes bookmarks from the browser used to request it.</li>
              <li><span className="font-medium text-[#14141e]">Product events</span> — an account-associated timestamp and allowlisted event name such as opening a digest, saving a paper, or pausing a schedule. Profile text, paper text, and paper identifiers are not included.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#14141e] mb-3">What we never do</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>We never read any existing Notion content — the integration only writes to the database you share with it.</li>
              <li>We do not sell your data or send it to third-party advertising or analytics services.</li>
              <li>We do not include project descriptions or paper content in first-party product event records.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#14141e] mb-3">Third-party services</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="font-medium text-[#14141e]">Clerk</span> — authentication for accounts that use Clerk sign-in. Clerk&apos;s own privacy policy applies to data processed through their service.</li>
              <li><span className="font-medium text-[#14141e]">Supabase</span> — database and storage. Data is stored in Singapore (AWS ap-southeast-1).</li>
              <li><span className="font-medium text-[#14141e]">OpenAI</span> — used to score and summarise papers. Paper titles and abstracts, plus your configured topics, experience level, lens, and optional project description, may be sent to OpenAI&apos;s API to personalize scoring and takeaways.</li>
              <li><span className="font-medium text-[#14141e]">Notion</span> — your integration token is used to write digest pages to your workspace via Notion's official API.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#14141e] mb-3">Data retention &amp; deletion</h2>
            <p>
              Your account data is retained while your account is active. Delete your account from
              Settings → Account. For Clerk accounts, AI Digest data is deleted when Clerk&apos;s deletion
              webhook is processed; for Notion-first accounts, linked AI Digest records are deleted
              when you confirm deletion. This removes your profile, encrypted integration credentials,
              preferences, product events, usage attempts, digest history, run history, and feedback. Deletion is
              irreversible. Pages already written to Notion remain in your workspace, and browser
              bookmarks must be cleared separately from that browser.
            </p>
            <p className="mt-3">
              You can request help with deletion at any time using the contact below.
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
