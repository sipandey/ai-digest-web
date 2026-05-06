import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/auth";
import SettingsView from "@/components/SettingsView";
import ErrorBoundary from "@/components/ErrorBoundary";

export default async function SettingsPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/");
  return (
    <ErrorBoundary label="Settings">
      <SettingsView />
    </ErrorBoundary>
  );
}
