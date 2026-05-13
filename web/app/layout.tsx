import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { headers } from "next/headers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://aidigest.app";
const OG_DESCRIPTION =
  "A personalised daily digest of arXiv AI papers — filtered to your interests, scored for your level, delivered to Notion every morning.";

export const metadata: Metadata = {
  title: { default: "AI Digest", template: "%s · AI Digest" },
  description: OG_DESCRIPTION,
  metadataBase: new URL(APP_URL),
  openGraph: {
    type: "website",
    siteName: "AI Digest",
    title: "AI Digest — Stay ahead of AI research. Without the noise.",
    description: OG_DESCRIPTION,
    url: APP_URL,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "AI Digest — Stay ahead of AI research. Without the noise." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Digest — Stay ahead of AI research. Without the noise.",
    description: OG_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the per-request CSP nonce set by proxy.ts middleware and forward it
  // to ClerkProvider so Clerk can apply it to the <script> tags it injects.
  //
  // Without this, Clerk injects scripts without a nonce attribute. The CSP in
  // proxy.ts uses 'strict-dynamic', which causes browsers to IGNORE 'self' and
  // hostname allowlists for <script> tags in HTML markup — only nonce-tagged
  // scripts (and scripts they dynamically load) are trusted. Un-nonce'd Clerk
  // scripts are therefore blocked, Clerk throws during hydration, and React
  // aborts hydration for the entire page tree, making all onClick handlers and
  // useState updates non-functional.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <ClerkProvider nonce={nonce}>
      <html lang="en" className={inter.className}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
