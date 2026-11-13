import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

const ALLOWED_EVENTS = new Set([
  "onboarding_completed",
  "digest_opened",
  "paper_expanded",
  "paper_saved",
  "paper_feedback",
  "schedule_paused",
]);

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body: unknown = await request.json();
    if (
      typeof body !== "object" || body === null ||
      !("event" in body) || typeof body.event !== "string" ||
      !ALLOWED_EVENTS.has(body.event)
    ) {
      return NextResponse.json({ error: "Unsupported event" }, { status: 400 });
    }

    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count, error: countError } = await supabaseAdmin
      .from("product_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since.toISOString());
    if (countError) throw countError;
    if ((count ?? 0) >= 100) return new NextResponse(null, { status: 204 });

    const { error } = await supabaseAdmin.from("product_events").insert({
      user_id: userId,
      event_name: body.event,
    });
    if (error) throw error;
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Product event recording failed:", error);
    return NextResponse.json({ error: "Event could not be recorded" }, { status: 500 });
  }
}
