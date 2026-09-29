/**
 * Unit tests for client-side bookmarking persistence layer
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Set up localStorage and window mocks for Node/Vitest environment
let mockStorage: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = String(value);
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    mockStorage = {};
  }),
};

vi.stubGlobal("localStorage", localStorageMock);
vi.stubGlobal("window", {
  dispatchEvent: vi.fn(),
  localStorage: localStorageMock,
});

import {
  getBookmarks,
  isBookmarked,
  toggleBookmark,
  removeBookmark,
  clearBookmarks,
  BOOKMARKS_STORAGE_KEY,
} from "../bookmarks";

describe("bookmarks persistence layer", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  const samplePaper = {
    arxiv_id: "2401.18059",
    title: "RAPTOR: Recursive Abstractive Processing for Tree-Organised Retrieval",
    category: "cs.LG",
    score: 9.1,
    builder_takeaway: "Add a summarisation tree above vector store.",
    pdf_url: "https://arxiv.org/pdf/2401.18059.pdf",
  };

  it("returns an empty array when no bookmarks exist", () => {
    expect(getBookmarks()).toEqual([]);
  });

  it("toggles bookmark on and off", () => {
    expect(isBookmarked(samplePaper.arxiv_id)).toBe(false);

    // Toggle on
    const added = toggleBookmark(samplePaper);
    expect(added).toBe(true);
    expect(isBookmarked(samplePaper.arxiv_id)).toBe(true);
    const list = getBookmarks();
    expect(list.length).toBe(1);
    expect(list[0].arxiv_id).toBe(samplePaper.arxiv_id);
    expect(list[0].title).toBe(samplePaper.title);
    expect(list[0].bookmarked_at).toBeDefined();

    // Toggle off
    const removed = toggleBookmark(samplePaper);
    expect(removed).toBe(false);
    expect(isBookmarked(samplePaper.arxiv_id)).toBe(false);
    expect(getBookmarks().length).toBe(0);
  });

  it("removes a specific bookmark", () => {
    toggleBookmark(samplePaper);
    toggleBookmark({ ...samplePaper, arxiv_id: "2402.99999", title: "Paper 2" });
    expect(getBookmarks().length).toBe(2);

    removeBookmark(samplePaper.arxiv_id);
    expect(getBookmarks().length).toBe(1);
    expect(isBookmarked(samplePaper.arxiv_id)).toBe(false);
    expect(isBookmarked("2402.99999")).toBe(true);
  });

  it("clears all bookmarks", () => {
    toggleBookmark(samplePaper);
    toggleBookmark({ ...samplePaper, arxiv_id: "2402.99999", title: "Paper 2" });
    expect(getBookmarks().length).toBe(2);

    clearBookmarks();
    expect(getBookmarks()).toEqual([]);
  });

  it("handles corrupted localStorage data gracefully", () => {
    mockStorage[BOOKMARKS_STORAGE_KEY] = "invalid json string{{";
    expect(getBookmarks()).toEqual([]);
  });
});
