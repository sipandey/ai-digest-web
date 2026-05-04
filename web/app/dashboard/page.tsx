import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/auth";
import DashboardView from "@/components/DashboardView";

export default async function DashboardPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/");
  return <DashboardView />;
}
