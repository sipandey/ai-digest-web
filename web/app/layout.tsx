import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
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
    // Add an og:image at /public/og-image.png (1200×630) to populate this.
    // images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Digest — Stay ahead of AI research. Without the noise.",
    description: OG_DESCRIPTION,
    // images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className={inter.className}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
