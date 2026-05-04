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

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-200 bg-white px-5 py-10 text-center">
        <p className="text-sm font-semibold text-gray-700">AI Digest</p>
        <p className="text-xs text-gray-400 mt-1">Built for developers learning AI</p>
        <div className="mt-5 flex items-center justify-center gap-6">
          <a href="#" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            GitHub
          </a>
          <a href="#" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Privacy
          </a>
        </div>
      </footer>
    </div>
  );
}
