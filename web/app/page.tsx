import Link from "next/link";
import { getAuthUserId } from "@/lib/auth";
import { InteractiveLensPreview } from "@/components/landing/InteractiveLensPreview";

export default async function LandingPage() {
  const userId = await getAuthUserId();

  return (
    <div className="min-h-screen bg-[#f4f4f8] text-[#14141e]">
      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-[#f4f4f8]/90 backdrop-blur border-b border-black/[0.06] px-5 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-base tracking-tight text-[#14141e] flex items-center gap-2">
          <span className="w-6 h-6 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-xs font-black">
            ⚡
          </span>
          <span>AI Digest</span>
        </Link>

        <div className="flex items-center gap-3">
          {userId ? (
            <Link
              href="/dashboard"
              className="text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <span>Dashboard</span>
              <span>→</span>
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-medium transition-colors"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative px-5 pt-20 pb-24 text-center overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 -z-10 flex items-start justify-center pt-10 pointer-events-none">
          <div className="w-[600px] h-[300px] bg-indigo-400/15 rounded-full blur-[100px]" />
        </div>

        {userId ? (
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-8">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span>Welcome back — Your briefing is ready</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium px-3.5 py-1.5 rounded-full mb-8">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
            Daily curated research. Zero noise.
          </div>
        )}

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-[#14141e] leading-[1.1] max-w-3xl mx-auto tracking-tight">
          Stay ahead of AI research.{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500">
            Without the noise.
          </span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-gray-600 max-w-xl mx-auto leading-relaxed">
          A personalized daily briefing of breakthrough arXiv papers — evaluated for your domain, scored for your experience level, with tailored takeaways for builders, founders, and researchers.
        </p>

        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          {userId ? (
            <Link
              href="/dashboard"
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold px-8 py-3.5 rounded-2xl text-base transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <span>Go to Dashboard</span>
              <span>→</span>
            </Link>
          ) : (
            <>
              <Link
                href="/signup"
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold px-8 py-3.5 rounded-2xl text-base transition-all shadow-sm"
              >
                Start free briefing →
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-medium px-8 py-3.5 rounded-2xl text-base transition-colors"
              >
                Sign in
              </Link>
            </>
          )}
        </div>

        {!userId && (
          <p className="mt-4 text-xs text-gray-400">
            Free forever for builders · In-App Reader · Email · Webhooks · Optional Notion
          </p>
        )}
      </section>

      {/* ── INTERACTIVE LENS PREVIEW ─────────────────────────────────────── */}
      <section className="px-5 py-16 bg-[#fafafc] border-y border-gray-200/60">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest text-center mb-3">
            Interactive Synthesis Demo
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#14141e] text-center mb-3">
            One paper. Three executive perspectives.
          </h2>
          <p className="text-sm text-gray-500 text-center mb-10 max-w-lg mx-auto">
            Click between lenses to see how our synthesis engine adapts the executive takeaway for your specific role.
          </p>

          <InteractiveLensPreview />
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section id="how" className="px-5 py-24">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest text-center mb-4">
            How it works
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#14141e] text-center mb-14">
            From 300+ arXiv preprints to 5 actionable papers
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                step: "01",
                title: "Choose your focus & lens",
                body: "Specify your project interests and preferred role lens (Builder, Founder, or Researcher) in plain language.",
              },
              {
                step: "02",
                title: "Automated morning evaluation",
                body: "Every morning, our pipeline scans all newly posted preprints across ML, CV, NLP, and AI — scoring relevance to your goals.",
              },
              {
                step: "03",
                title: "Multi-channel delivery",
                body: "Enjoy our distraction-free Web Reader, receive morning email digests, pipe into Slack/Discord, or sync to Notion.",
              },
            ].map(({ step, title, body }) => (
              <div
                key={step}
                className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-4"
              >
                <span className="text-3xl font-bold text-indigo-200 leading-none">
                  {step}
                </span>
                <h3 className="text-base font-semibold text-[#14141e]">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT YOU GET ─────────────────────────────────────────────────── */}
      <section className="px-5 py-24 bg-white">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest text-center mb-4">
            What you get
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#14141e] text-center mb-14">
            Designed for technical decision-makers
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                icon: "🎯",
                title: "Calibrated 0-10 match score",
                body: "Papers ranked strictly against your technical domain and project profile, filtering out irrelevant noise.",
              },
              {
                icon: "🏗️",
                title: "Actionable executive takeaways",
                body: "Every paper comes with concrete architecture, implementation, or product takeaways you can immediately apply.",
              },
              {
                icon: "⭐",
                title: "Paper bookmarks & quick-share",
                body: "Save high-signal papers to your personal library and copy formatted takeaways directly to your team with 1 click.",
              },
              {
                icon: "⚡",
                title: "Multi-channel flexibility",
                body: "Read in our modern web app, get daily email digests, pipe alerts into Discord/Slack, or export to Notion.",
              },
            ].map(({ icon, title, body }) => (
              <div
                key={title}
                className="bg-[#f4f4f8] border border-gray-200 rounded-2xl p-6 flex gap-4 items-start"
              >
                <span className="text-2xl shrink-0">{icon}</span>
                <div>
                  <h3 className="text-sm font-semibold text-[#14141e] mb-1.5">
                    {title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section className="px-5 py-24 bg-[#f4f4f8]">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest text-center mb-4">
            FAQ
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#14141e] text-center mb-12">
            Common questions
          </h2>

          <div className="space-y-4">
            {[
              {
                q: "Do I need a Notion account to use AI Digest?",
                a: "No! AI Digest features a full native in-app Web Reader and daily email briefings. Notion integration is completely optional for users who want to archive digests in their workspace.",
              },
              {
                q: "How does the relevance scoring work?",
                a: "Every paper is evaluated by an LLM model against your exact focus topics and background level, scoring its technical rigor and practical utility on a 0-10 scale.",
              },
              {
                q: "Can I customize my synthesis lens later?",
                a: "Yes. From your Settings page, you can switch between Builder, Founder, and Researcher lenses, or adjust your delivery channels at any time.",
              },
              {
                q: "What if no papers match my interests on a given day?",
                a: "The pipeline only publishes papers that meet your relevance threshold. On quiet days (such as arXiv weekend freezes), you receive zero noise — only quality papers when they appear.",
              },
              {
                q: "How much does it cost?",
                a: "AI Digest is completely free for individual builders and researchers. It runs on public arXiv feeds and optimized LLM evaluation.",
              },
            ].map(({ q, a }) => (
              <details key={q} className="group bg-white border border-gray-200 rounded-2xl">
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none">
                  <span className="text-sm font-semibold text-[#14141e] pr-4">{q}</span>
                  <svg
                    className="w-4 h-4 text-gray-400 shrink-0 transition-transform group-open:rotate-180"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-5 pb-5 text-sm text-gray-500 leading-relaxed -mt-1">{a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-200 bg-white px-5 py-10 text-center">
        <p className="text-sm font-semibold text-gray-700">AI Digest</p>
        <p className="text-xs text-gray-400 mt-1">Curated intelligence for AI builders & researchers</p>
        <div className="mt-5 flex items-center justify-center gap-6">
          <a
            href="https://github.com/sipandey/ai-digest-web"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            GitHub
          </a>
          <a href="/privacy" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Privacy
          </a>
          <a href="/terms" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Terms
          </a>
        </div>
      </footer>
    </div>
  );
}
