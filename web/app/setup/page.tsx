import { redirect } from "next/navigation";

export const metadata = { title: "Set up AI Digest" };

export default function SetupPage() {
  // Standardize on Clerk authentication for all new signups
  redirect("/signup");
}
