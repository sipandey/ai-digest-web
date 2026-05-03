import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { userId } = await req.json();
  // TODO: trigger pipeline run for userId
  return NextResponse.json({ triggered: true, userId });
}
