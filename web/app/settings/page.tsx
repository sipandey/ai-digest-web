import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import SettingsView from "@/components/SettingsView";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");
  return <SettingsView />;
}
