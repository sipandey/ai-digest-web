/**
 * Notion utility helpers shared across API routes.
 */

/**
 * Extracts a canonical 32-character hex ID from a raw string or full Notion URL.
 * Handles:
 *  - 32 hex chars: "35540c6e10f380d39ce1fbb025be5ee9"
 *  - UUID format: "35540c6e-10f3-80d3-9ce1-fbb025be5ee9"
 *  - Full Notion URLs: "https://app.notion.com/p/35540c6e10f380d39ce1fbb025be5ee9?v=..."
 *  - Workspace URLs: "https://notion.so/workspace/Page-Title-35540c6e10f380d39ce1fbb025be5ee9?v=..."
 */
export function extractNotionDatabaseId(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;

  const trimmed = raw.trim();

  // 1. Direct 32-hex or hyphenated UUID check
  const clean = trimmed.replace(/-/g, "");
  if (/^[0-9a-f]{32}$/i.test(clean)) {
    return clean.toLowerCase();
  }

  // 2. Full URL handling: remove query string (?v=...) and hash
  const pathOnly = trimmed.split("?")[0].split("#")[0];

  // Match 32 hex chars (optionally hyphenated) embedded at the end of the path segment
  const match = pathOnly.match(/([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}|[0-9a-f]{32})$/i);
  if (match) {
    return match[1].replace(/-/g, "").toLowerCase();
  }

  return null;
}

/**
 * Returns true if `id` is a valid Notion database/page ID or URL containing a valid 32-hex ID.
 */
export function isValidNotionDatabaseId(raw: string): boolean {
  return extractNotionDatabaseId(raw) !== null;
}

/**
 * Strip hyphens/URL wrappers and return the canonical 32-char hex ID.
 */
export function cleanNotionDatabaseId(raw: string): string {
  const extracted = extractNotionDatabaseId(raw);
  return extracted ?? raw.replace(/-/g, "");
}
