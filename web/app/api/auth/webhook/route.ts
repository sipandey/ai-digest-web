import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { supabaseAdmin } from "@/lib/supabase";

type ClerkEvent = {
  type: string;
  data: {
    id: string;
    email_addresses?: { email_address: string; primary: boolean }[];
    first_name?: string | null;
    last_name?: string | null;
  };
};

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Missing CLERK_WEBHOOK_SECRET" },
      { status: 500 }
    );
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing svix headers" },
      { status: 400 }
    );
  }

  const body = await req.text();
  const wh = new Webhook(secret);

  let event: ClerkEvent;
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkEvent;
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

  // ── user.deleted — soft-delete so the pipeline stops running for them ────────
  if (event.type === "user.deleted") {
    const clerkId = event.data.id;
    if (clerkId) {
      await supabaseAdmin
        .from("users")
        .update({ active: false })
        .eq("clerk_id", clerkId);
    }
    return NextResponse.json({ received: true });
  }

  if (event.type !== "user.created") {
    return NextResponse.json({ received: true });
  }

  const { id: clerkId, email_addresses = [], first_name, last_name } = event.data;

  const primaryEmail =
    email_addresses.find((e) => e.primary)?.email_address ??
    email_addresses[0]?.email_address;

  const name = [first_name, last_name].filter(Boolean).join(" ") || null;

  // ── Account linking: if this email belongs to an existing Notion-first user,
  // attach the Clerk ID instead of creating a duplicate row. ──────────────────
  if (primaryEmail) {
    const { data: existingByEmail } = await supabaseAdmin
      .from("users")
      .select("id, clerk_id")
      .eq("email", primaryEmail)
      .maybeSingle();

    if (existingByEmail && !existingByEmail.clerk_id) {
      // Link the new Clerk account to the pre-existing Notion-first account
      await supabaseAdmin
        .from("users")
        .update({ clerk_id: clerkId, name: name ?? undefined })
        .eq("id", existingByEmail.id);
      return NextResponse.json({ received: true });
    }

    if (existingByEmail?.clerk_id) {
      // Duplicate signup for an already-claimed email — ignore silently
      return NextResponse.json({ received: true });
    }
  }

  // ── Brand-new user — upsert (handles race condition where page-load already
  // created a stub row with clerk_id before this webhook arrived) ───────────────
  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .upsert(
      { clerk_id: clerkId, email: primaryEmail ?? null, name },
      { onConflict: "clerk_id" },
    )
    .select("id")
    .single();

  if (userError) {
    console.error("Failed to upsert user:", userError);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }

  const { error: configError } = await supabaseAdmin
    .from("user_configs")
    .upsert({ user_id: user.id }, { onConflict: "user_id" });

  if (configError) {
    console.error("Failed to upsert user_config:", configError);
    return NextResponse.json(
      { error: "Failed to create user config" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
