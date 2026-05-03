import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ClerkUserCreatedEvent = {
  type: string;
  data: {
    id: string;
    email_addresses: { email_address: string; primary: boolean }[];
    first_name: string | null;
    last_name: string | null;
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

  // Verify signature
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

  let event: ClerkUserCreatedEvent;
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkUserCreatedEvent;
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

  if (event.type !== "user.created") {
    return NextResponse.json({ received: true });
  }

  const { id: clerkId, email_addresses, first_name, last_name } = event.data;

  const primaryEmail = email_addresses.find((e) => e.primary)?.email_address
    ?? email_addresses[0]?.email_address;

  const name = [first_name, last_name].filter(Boolean).join(" ") || null;

  // Insert user
  const { data: user, error: userError } = await supabase
    .from("users")
    .insert({ clerk_id: clerkId, email: primaryEmail, name })
    .select("id")
    .single();

  if (userError) {
    console.error("Failed to insert user:", userError);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }

  // Insert default user config
  const { error: configError } = await supabase
    .from("user_configs")
    .insert({ user_id: user.id });

  if (configError) {
    console.error("Failed to insert user_config:", configError);
    return NextResponse.json(
      { error: "Failed to create user config" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
