import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  return NextResponse.json({ users: [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return NextResponse.json({ created: true, data: body });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  return NextResponse.json({ updated: true, data: body });
}
