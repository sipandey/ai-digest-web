import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* ------------------------------------------------------------------ */}
      {/* NAV                                                                  */}
      {/* ------------------------------------------------------------------ */}
      <nav className="bg-gray-950 px-6 py-4 flex items-center justify-between">
        <span className="text-white font-semibold text-lg tracking-tight">
          AI Digest
        </span>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-gray-300 hover:text-white"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-md"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/* HERO                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-gray-950 px-6 py-28 text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight max-w-3xl mx-auto">
          Stay ahead of AI research.
          <br />
          <span className="text-indigo-400">Without the noise.</span>
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
          A personalised daily digest of arXiv papers filtered to your
          interests, scored for your level, delivered to your Notion workspace
          every morning.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-8 py-3 rounded-md text-base"
          >
            Get started free
          </Link>
          <a
            href="#how"
            className="w-full sm:w-auto border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white font-medium px-8 py-3 rounded-md text-base"
          >
            See how it works
          </a>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* HOW IT WORKS                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section id="how" className="px-6 py-24 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-16">
            How it works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              {
                step: "1",
                title: "Tell us what you're building",
                body: "Describe your project and experience level in plain English. No arXiv categories needed.",
              },
              {
                step: "2",
                title: "We scan arXiv every morning",
                body: "Every paper from the last 24 hours across ML, NLP, and AI — filtered and scored specifically for you.",
              },
              {
                step: "3",
                title: "Your digest lands in Notion",
                body: "Each paper gets a Problem, Approach, Results, and Builder Takeaway — in your Notion workspace before you start your day.",
              },
            ].map(({ step, title, body }) => (
              <div key={step} className="flex flex-col items-start">
                <span className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-600 text-white font-bold text-sm mb-4">
                  {step}
                </span>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {title}
                </h3>
                <p className="text-gray-500 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* WHAT YOU GET                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="px-6 py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-16">
            What you get
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {[
              {
                title: "Personalised scoring",
                body: "Papers ranked by how useful they are for YOUR project and YOUR experience level.",
              },
              {
                title: "Builder takeaways",
                body: "Every paper summarised with one concrete thing you can actually do with it.",
              },
              {
                title: "Learning path hints",
                body: "Each paper tells you what to understand before reading it in full.",
              },
              {
                title: "Notion native",
                body: "Toggle-able paper summaries, run metadata, searchable archive — all in your existing Notion workspace.",
              },
            ].map(({ title, body }) => (
              <div
                key={title}
                className="bg-white border border-gray-200 rounded-lg p-6"
              >
                <h3 className="text-base font-semibold text-gray-900 mb-2">
                  {title}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* PRICING                                                              */}
      {/* ------------------------------------------------------------------ */}
      <section className="px-6 py-24 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-16">
            Pricing
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-start">
            {/* Free */}
            <div className="border border-gray-200 rounded-lg p-8 flex flex-col">
              <h3 className="text-xl font-bold text-gray-900">Free</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                $0
                <span className="text-base font-normal text-gray-500">
                  /month
                </span>
              </p>
              <ul className="mt-6 space-y-3 text-sm text-gray-600 flex-1">
                {[
                  "Daily digest",
                  "Up to 5 topics",
                  "Standard scoring",
                  "7-day archive in Notion",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-indigo-600">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="mt-8 block text-center bg-gray-900 hover:bg-gray-700 text-white font-medium px-6 py-3 rounded-md text-sm"
              >
                Get started free
              </Link>
            </div>

            {/* Pro */}
            <div className="border-2 border-indigo-600 rounded-lg p-8 flex flex-col relative">
              <span className="absolute top-4 right-4 text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">
                Coming soon
              </span>
              <h3 className="text-xl font-bold text-gray-900">Pro</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                $9
                <span className="text-base font-normal text-gray-500">
                  /month
                </span>
              </p>
              <ul className="mt-6 space-y-3 text-sm text-gray-600 flex-1">
                {[
                  "Everything in free",
                  "Unlimited topics",
                  "Custom scoring priorities",
                  "Weekly pattern reports",
                  "30-day archive",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-indigo-600">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <button
                disabled
                className="mt-8 block w-full text-center bg-indigo-100 text-indigo-400 font-medium px-6 py-3 rounded-md text-sm cursor-not-allowed"
              >
                Coming soon
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* FOOTER                                                               */}
      {/* ------------------------------------------------------------------ */}
      <footer className="bg-gray-950 px-6 py-10 text-center">
        <p className="text-gray-400 text-sm">
          AI Digest · Built for developers learning AI
        </p>
        <div className="mt-3 flex items-center justify-center gap-6 text-sm">
          <a href="#" className="text-gray-500 hover:text-gray-300">
            GitHub
          </a>
          <a href="#" className="text-gray-500 hover:text-gray-300">
            Privacy
          </a>
        </div>
      </footer>
    </div>
  );
}
