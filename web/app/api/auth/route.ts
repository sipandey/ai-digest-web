import { NextRequest, NextResponse } from "next/server";

// Clerk webhook handler
export async function POST(req: NextRequest) {
  return NextResponse.json({ received: true });
}
