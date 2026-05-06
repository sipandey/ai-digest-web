import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f4f4f8] text-[#14141e]">

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-[#f4f4f8]/90 backdrop-blur border-b border-black/[0.06] px-5 py-4 flex items-center justify-between">
        <span className="font-bold text-base tracking-tight text-[#14141e]">
          AI Digest
        </span>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/setup"
            className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-medium transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative px-5 pt-24 pb-28 text-center overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 -z-10 flex items-start justify-center pt-10 pointer-events-none">
          <div className="w-[600px] h-[300px] bg-indigo-400/15 rounded-full blur-[100px]" />
        </div>

        <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-600 text-xs font-medium px-3 py-1.5 rounded-full mb-8">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
          Daily digest. Zero noise.
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-[#14141e] leading-[1.1] max-w-3xl mx-auto tracking-tight">
          Stay ahead of AI research.{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500">
            Without the noise.
          </span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-gray-500 max-w-xl mx-auto leading-relaxed">
          A personalised daily digest of arXiv papers — filtered to your
          interests, scored for your experience level, delivered to Notion every
          morning.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/setup"
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold px-8 py-3.5 rounded-2xl text-base transition-colors"
          >
            Continue with Notion →
          </Link>
          <Link
            href="/signup"
            className="w-full sm:w-auto bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 font-medium px-8 py-3.5 rounded-2xl text-base transition-colors"
          >
            Sign up with email
          </Link>
        </div>
        <p className="mt-4 text-sm text-gray-400">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-600 hover:underline">
            Sign in
          </Link>{" · "}
          <Link href="/setup/verify" className="text-indigo-600 hover:underline">
            Return with Notion token
          </Link>
        </p>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section id="how" className="px-5 py-24">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest text-center mb-4">
            How it works
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#14141e] text-center mb-14">
            Research, filtered for builders
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                step: "01",
                title: "Tell us what you're building",
                body: "Describe your project and experience level in plain English. No arXiv categories needed.",
              },
              {
                step: "02",
                title: "We scan arXiv every morning",
                body: "Every paper from the last 24 hours across ML, NLP, and AI — filtered and scored specifically for you.",
              },
              {
                step: "03",
                title: "Your digest lands in Notion",
                body: "Each paper gets a Problem, Approach, Results, and Builder Takeaway — ready before you start your day.",
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
            Everything a builder needs
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                icon: "🎯",
                title: "Personalised scoring",
                body: "Papers ranked by how useful they are for YOUR project and YOUR experience level.",
              },
              {
                icon: "🏗️",
                title: "Builder takeaways",
                body: "Every paper summarised with one concrete thing you can actually implement.",
              },
              {
                icon: "📚",
                title: "Learning path hints",
                body: "Each paper tells you what to understand before reading it in full.",
              },
              {
                icon: "✍️",
                title: "Notion native",
                body: "Toggle-able summaries, searchable archive — all in your existing Notion workspace.",
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

      {/* ── EXAMPLE DIGEST ───────────────────────────────────────────────── */}
      <section className="px-5 py-24 bg-[#f4f4f8]">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest text-center mb-4">
            Example output
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#14141e] text-center mb-4">
            This is what lands in your Notion
          </h2>
          <p className="text-sm text-gray-500 text-center mb-12 max-w-lg mx-auto">
            Every paper gets a structured summary you can actually act on — not just an abstract dump.
          </p>

          {/* Mock Notion page card */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm max-w-2xl mx-auto">
            {/* Notion-style page header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">9.1 / 10</span>
                <span className="text-xs text-gray-400">cs.LG · RAG and retrieval systems</span>
              </div>
              <h3 className="text-base font-bold text-[#14141e] leading-snug">
                RAPTOR: Recursive Abstractive Processing for Tree-Organised Retrieval
              </h3>
              <p className="text-xs text-gray-400 mt-1.5">Sarthi et al. · Stanford · arXiv:2401.18059</p>
            </div>

            {/* Summary sections */}
            <div className="divide-y divide-gray-50">
              {[
                {
                  label: "🧩 Problem",
                  text: "Standard RAG retrieves only short, local text chunks, missing cross-document themes and high-level reasoning — causing failures on multi-hop questions that require synthesising information across many passages.",
                },
                {
                  label: "⚙️ Approach",
                  text: "Clusters leaf chunks, summarises each cluster recursively to build a tree of abstractions, then retrieves from all levels at query time. Tree construction uses k-means on embeddings; summaries are generated with GPT-4.",
                },
                {
                  label: "📊 Results",
                  text: "20% relative improvement on QASPER and QuALITY vs flat RAG. Particularly strong on multi-hop questions (up to 35% gain). Works with any embedding + LLM pair.",
                },
                {
                  label: "🔨 Builder takeaway",
                  text: "Add a summarisation layer above your existing vector store — cluster chunks nightly and embed the summaries alongside originals. Retrieval at inference time is unchanged.",
                },
                {
                  label: "📚 Learning path",
                  text: "Understand vector similarity search and basic RAG pipelines before diving in.",
                },
              ].map(({ label, text }) => (
                <div key={label} className="px-6 py-4">
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">{label}</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
                </div>
              ))}
            </div>

            <div className="px-6 py-3 bg-gray-50 flex items-center gap-3">
              <a href="#" className="text-xs text-indigo-600 font-medium hover:underline">View PDF ↗</a>
              <span className="text-gray-200">|</span>
              <span className="text-xs text-gray-400">Delivered 07:00 IST · AI Digest</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section className="px-5 py-24 bg-white">
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
                q: "Is my Notion token safe?",
                a: "Your integration token is stored encrypted at rest in our database and used only to write digest pages to your Notion workspace. We never read any existing Notion content — the integration only has the access you grant it. You can revoke access at any time from notion.so/my-integrations.",
              },
              {
                q: "What Notion access does the integration need?",
                a: "Read content (to verify the database exists), Insert content (to create new digest pages), and Update content (to refresh pages on re-runs). The integration can only access the specific database you share with it — not your entire workspace.",
              },
              {
                q: "How much does it cost?",
                a: "AI Digest is free. The pipeline runs on arXiv's public API and uses a small amount of OpenAI quota per user per day. If you find it valuable, there's a \"Buy me a coffee\" link in the footer — entirely optional.",
              },
              {
                q: "What if no papers match my interests on a given day?",
                a: "The pipeline runs every morning and the digest is only created when papers pass your relevance threshold. On slow days (weekends, holidays) you may not receive anything — that's intentional. Better nothing than noise.",
              },
              {
                q: "Can I change my topics and settings later?",
                a: "Yes — open Settings from your dashboard. Changes apply from the next morning's run.",
              },
              {
                q: "Do I need a Notion account to sign up?",
                a: "Yes — the entire product is Notion-native. Your digest is delivered as a Notion database page, so you'll need a free Notion account and an integration token. Setup takes about two minutes.",
              },
              {
                q: "Can I use an email account instead of the Notion-first flow?",
                a: "Yes. Click \"Sign up with email\" on the home page to create a password-based account first, then connect Notion during onboarding. Both paths end up in the same place.",
              },
            ].map(({ q, a }) => (
              <details key={q} className="group bg-[#f4f4f8] rounded-2xl">
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
        <p className="text-xs text-gray-400 mt-1">Built for developers learning AI</p>
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
        </div>
      </footer>
    </div>
  );
}
