/**
 * One-time migration: encrypt plaintext notion_token and notion_database_id
 * values stored before application-layer encryption was introduced.
 *
 * Requires Node.js 18+ (for globalThis.crypto.subtle).
 *
 * Run from the web/ directory:
 *
 *   cd web
 *   nvm use 20                               # or any Node >= 18
 *   NOTION_TOKEN_ENCRYPTION_KEY=<64-hex-chars> \
 *   NEXT_PUBLIC_SUPABASE_URL=<url> \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   node scripts/encrypt-existing-tokens.mjs
 *
 * The script is idempotent — rows that already contain encrypted values
 * (iv.ciphertext base64url format) are detected and skipped automatically.
 */

// Use dynamic import so this file works as a plain .mjs in Node 18+
const { createClient } = await import("@supabase/supabase-js");
const { webcrypto } = await import("node:crypto");

// Node 18 exposes crypto.subtle globally; earlier versions need webcrypto.subtle
const subtle = globalThis.crypto?.subtle ?? webcrypto.subtle;

// ── AES-256-GCM helpers (mirrors web/lib/encryption.ts) ──────────────────────

const ALGO = "AES-GCM";
const IV_BYTES = 12;

async function loadKey() {
  const raw = process.env.NOTION_TOKEN_ENCRYPTION_KEY ?? "";
  if (!raw) throw new Error("NOTION_TOKEN_ENCRYPTION_KEY env var is not set");
  if (!/^[0-9a-f]{64}$/i.test(raw))
    throw new Error("NOTION_TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters");
  return subtle.importKey(
    "raw",
    Buffer.from(raw, "hex"),
    { name: ALGO },
    false,
    ["encrypt"],
  );
}

function isEncryptedValue(value) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

async function encryptValue(plaintext, cryptoKey) {
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await subtle.encrypt(
    { name: ALGO, iv },
    cryptoKey,
    new TextEncoder().encode(plaintext),
  );
  return `${Buffer.from(iv).toString("base64url")}.${Buffer.from(ct).toString("base64url")}`;
}

// ── migration ─────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const FIELDS = ["notion_token", "notion_database_id"];

const cryptoKey = await loadKey();

console.log("Fetching user_configs rows…");
const { data: rows, error } = await supabase
  .from("user_configs")
  .select("user_id, notion_token, notion_database_id");

if (error) {
  console.error("Failed to fetch rows:", error.message);
  process.exit(1);
}

if (!rows?.length) {
  console.log("No rows found — nothing to migrate.");
  process.exit(0);
}

console.log(`Found ${rows.length} row(s). Checking for plaintext values…\n`);

let migrated = 0;
let skipped = 0;

for (const row of rows) {
  const updates = {};

  for (const field of FIELDS) {
    const value = row[field];
    if (typeof value === "string" && value && !isEncryptedValue(value)) {
      updates[field] = await encryptValue(value, cryptoKey);
    }
  }

  if (!Object.keys(updates).length) {
    skipped++;
    continue;
  }

  const { error: updateError } = await supabase
    .from("user_configs")
    .update(updates)
    .eq("user_id", row.user_id);

  if (updateError) {
    console.error(`  ✗ user_id=${row.user_id}:`, updateError.message);
  } else {
    console.log(`  ✓ user_id=${row.user_id}: encrypted ${Object.keys(updates).join(", ")}`);
    migrated++;
  }
}

console.log(`\nDone.  Migrated: ${migrated}  Already encrypted / skipped: ${skipped}`);
