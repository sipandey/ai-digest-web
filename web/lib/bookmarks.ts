/**
 * Client-side Bookmarking Persistence Layer
 *
 * Persists bookmarked papers to localStorage with fallback handling.
 * Dispatches a custom window event (`aidigest:bookmarks-updated`) so
 * subscribed components automatically update without full-page reloads.
 */

export const BOOKMARKS_STORAGE_KEY = "aidigest:bookmarked_papers";
export const BOOKMARKS_EVENT_NAME = "aidigest:bookmarks-updated";

export type BookmarkedPaper = {
  arxiv_id: string;
  title: string;
  category?: string;
  score: number;
  builder_takeaway?: string;
  pdf_url?: string;
  bookmarked_at: string;
};

function dispatchBookmarksEvent() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(BOOKMARKS_EVENT_NAME));
  }
}

/** Retrieve all bookmarked papers from localStorage. */
export function getBookmarks(): BookmarkedPaper[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Check if a specific arXiv ID is currently bookmarked. */
export function isBookmarked(arxivId: string): boolean {
  if (!arxivId) return false;
  const list = getBookmarks();
  return list.some((p) => p.arxiv_id === arxivId);
}

/**
 * Toggle bookmark state for a paper.
 * Returns `true` if paper is now bookmarked, `false` if removed.
 */
export function toggleBookmark(
  paper: Omit<BookmarkedPaper, "bookmarked_at">
): boolean {
  if (typeof window === "undefined" || !paper.arxiv_id) return false;
  const current = getBookmarks();
  const exists = current.some((p) => p.arxiv_id === paper.arxiv_id);

  let next: BookmarkedPaper[];
  let isNowBookmarked: boolean;

  if (exists) {
    next = current.filter((p) => p.arxiv_id !== paper.arxiv_id);
    isNowBookmarked = false;
  } else {
    const entry: BookmarkedPaper = {
      ...paper,
      bookmarked_at: new Date().toISOString(),
    };
    next = [entry, ...current];
    isNowBookmarked = true;
  }

  try {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.error("Failed to save bookmarks to localStorage:", err);
  }

  dispatchBookmarksEvent();
  return isNowBookmarked;
}

/** Remove a specific paper from bookmarks. */
export function removeBookmark(arxivId: string): void {
  if (typeof window === "undefined" || !arxivId) return;
  const current = getBookmarks();
  const next = current.filter((p) => p.arxiv_id !== arxivId);
  try {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.error("Failed to update bookmarks in localStorage:", err);
  }
  dispatchBookmarksEvent();
}

/** Clear all bookmarked papers. */
export function clearBookmarks(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BOOKMARKS_STORAGE_KEY);
  } catch (err) {
    console.error("Failed to clear bookmarks from localStorage:", err);
  }
  dispatchBookmarksEvent();
}
