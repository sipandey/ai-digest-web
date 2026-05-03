import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import DashboardView from "@/components/DashboardView";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");
  return <DashboardView />;
}
