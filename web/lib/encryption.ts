/**
 * Application-layer AES-256-GCM encryption for sensitive credential fields
 * (notion_token, notion_database_id) stored in user_configs.
 *
 * Uses the Web Crypto API — available in Node.js 18+ and the Next.js Edge
 * runtime with no additional dependencies.
 *
 * Ciphertext format:  base64url(iv[12 bytes]) + "." + base64url(ciphertext+authTag)
 *
 * Key source: NOTION_TOKEN_ENCRYPTION_KEY env var — must be exactly 64 hex
 * characters (32 bytes = 256-bit key).
 * Generate with: openssl rand -hex 32
 *
 * Backward compatibility:
 *   decrypt() returns the input unchanged if it doesn't match the encrypted
 *   format.  This handles the transition period where old rows still contain
 *   plaintext values.  Run scripts/encrypt-existing-tokens.ts once to migrate
 *   all rows to ciphertext.
 */

const ALGO = "AES-GCM";
const IV_BYTES = 12; // 96-bit IV — GCM standard

async function importKey(): Promise<CryptoKey> {
  const raw = process.env.NOTION_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("NOTION_TOKEN_ENCRYPTION_KEY env var is not set");
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error(
      "NOTION_TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)",
    );
  }
  return crypto.subtle.importKey(
    "raw",
    Buffer.from(raw, "hex"),
    { name: ALGO },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Returns true if the string matches the iv.ciphertext format produced by
 * encrypt().  Used to distinguish encrypted values from legacy plaintext.
 */
export function isEncryptedValue(value: string): boolean {
  // Both parts must be non-empty base64url strings separated by exactly one dot.
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

/** Encrypt a plaintext string. Returns "base64url(iv).base64url(ciphertext)". */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded);
  const ivB64 = Buffer.from(iv).toString("base64url");
  const ctB64 = Buffer.from(ciphertext).toString("base64url");
  return `${ivB64}.${ctB64}`;
}

/**
 * Decrypt a value produced by encrypt().
 *
 * If the value does not match the encrypted format (legacy plaintext row),
 * it is returned unchanged so the pipeline continues to work during the
 * migration window.
 */
export async function decrypt(value: string): Promise<string> {
  // Backward-compat: not yet migrated — return as-is
  if (!isEncryptedValue(value)) return value;

  const dot = value.indexOf(".");
  const iv = Buffer.from(value.slice(0, dot), "base64url");
  const ct = Buffer.from(value.slice(dot + 1), "base64url");
  const key = await importKey();
  const plaintext = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ct);
  return new TextDecoder().decode(plaintext);
}
