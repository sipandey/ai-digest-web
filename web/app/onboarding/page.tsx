import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/auth";
import OnboardingForm from "@/components/OnboardingForm";

export default async function OnboardingPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/");
  return <OnboardingForm />;
}
