/**
 * Notion utility helpers shared across API routes.
 */

/**
 * Returns true if `id` is a valid Notion database/page ID — exactly 32 hex
 * characters after stripping hyphens (the standard UUID form Notion uses).
 *
 * Why this matters: the value is interpolated directly into a Notion API URL
 *   `https://api.notion.com/v1/databases/${id}`
 * A value like `../pages/abc123` or `abc?evil=1` would turn this server into
 * an open proxy for arbitrary Notion API endpoints (path traversal / SSRF).
 * Rejecting anything that isn't exactly 32 hex chars closes that entirely.
 */
export function isValidNotionDatabaseId(raw: string): boolean {
  const clean = raw.replace(/-/g, "");
  return /^[0-9a-f]{32}$/i.test(clean);
}

/**
 * Strip hyphens and return the canonical 32-char hex ID.
 * Always call isValidNotionDatabaseId() first.
 */
export function cleanNotionDatabaseId(raw: string): string {
  return raw.replace(/-/g, "");
}
