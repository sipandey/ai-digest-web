import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("paper_feedback")
    .select("arxiv_id, rating")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch feedback" }, { status: 500 });
  }

  const feedbackMap: Record<string, string> = {};
  for (const item of data || []) {
    if (item.arxiv_id && item.rating) {
      feedbackMap[item.arxiv_id] = item.rating;
    }
  }

  return NextResponse.json({ feedback: feedbackMap });
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { arxiv_id, rating, paper_title, paper_categories } = body;

    if (!arxiv_id || typeof arxiv_id !== "string") {
      return NextResponse.json({ error: "Missing or invalid arxiv_id" }, { status: 400 });
    }

    if (rating !== "more" && rating !== "less") {
      return NextResponse.json(
        { error: "Rating must be 'more' or 'less'" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("paper_feedback")
      .upsert(
        {
          user_id: userId,
          arxiv_id,
          rating,
          paper_title: paper_title || null,
          paper_categories: Array.isArray(paper_categories) ? paper_categories : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,arxiv_id" }
      );

    if (error) {
      return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      feedback: { arxiv_id, rating },
    });
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const arxivId = searchParams.get("arxiv_id");

  if (!arxivId) {
    return NextResponse.json({ error: "Missing arxiv_id parameter" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("paper_feedback")
    .delete()
    .eq("user_id", userId)
    .eq("arxiv_id", arxivId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete feedback" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
