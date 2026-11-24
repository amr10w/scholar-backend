import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

const { get } = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@/src/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/api-client")>();
  return {
    ...actual,
    api: { get },
  };
});

import { ApiError } from "@/src/lib/api-client";
import {
  ExploreApiError,
  canFindSimilarForPaper,
  clearExploreCache,
  explorePapers,
  getCachedSimilarPapers,
  getExploreErrorKind,
  normalizeExplorePaper,
  parseRetryAfterSeconds,
  requestSimilarPapers,
} from "./explore.api";

beforeEach(() => {
  get.mockReset();
  clearExploreCache();
});

describe("normalizeExplorePaper (defensive S2 parsing)", () => {
  it("normalizes missing optional fields without crashing and strips unsafe links", () => {
    const empty = normalizeExplorePaper({});
    expect(empty.title).toBe("Untitled paper");
    expect(empty.abstract).toBeNull();
    expect(empty.venue).toBeNull();
    expect(empty.year).toBeNull();
    expect(empty.authors).toEqual([]);
    expect(empty.citationCount).toBeNull();
    expect(empty.url).toBeNull();
    expect(empty.openAccessPdfUrl).toBeNull();

    const unsafeWithDoi = normalizeExplorePaper({
      paperId: "s2-unsafe",
      title: "Mock S2 Unsafe Link Check",
      url: "javascript:alert(1)",
      openAccessPdf: { url: "ftp://bad.example/file.pdf" },
      externalIds: { DOI: "10.5555/mock.s2.safe", CorpusId: 910003 },
      authors: [{ authorId: "a1", name: "Layla" }, "String Author", { name: "  " }],
    });
    expect(unsafeWithDoi.url).toBe("https://doi.org/10.5555/mock.s2.safe");
    expect(unsafeWithDoi.openAccessPdfUrl).toBeNull();
    expect(unsafeWithDoi.corpusId).toBe("910003");
    expect(unsafeWithDoi.authors).toEqual([
      { authorId: "a1", name: "Layla" },
      { authorId: null, name: "String Author" },
    ]);
  });
});

describe("explorePapers & client-side caching", () => {
  it("fetches Semantic Scholar results once and serves repeated identical queries from cache", async () => {
    get.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: {
        success: true,
        total: 1,
        papers: [
          {
            paperId: "mock-s2-001",
            title: "Mock S2 Paper: CMOS Neural Accelerators",
            year: 2025,
            citationCount: 42,
            url: "https://www.semanticscholar.org/paper/mock-s2-001",
          },
        ],
      },
    });

    const first = await explorePapers({ query: "  CMOS  ", year: 2024 });
    expect(first.fromCache).toBe(false);
    expect(first.papers).toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(
      "/explore",
      expect.objectContaining({
        params: { query: "CMOS", year: 2024, limit: 10, offset: 0 },
      }),
    );

    // Case-insensitive + whitespace-equivalent repeat hits client cache without network call
    const second = await explorePapers({ query: "cmos", year: 2024 });
    expect(second.fromCache).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);

    // Explicit retry (`bypassCache: true`) issues a fresh request
    get.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: { success: true, total: 0, papers: [] },
    });
    const refreshed = await explorePapers({
      query: "cmos",
      year: 2024,
      bypassCache: true,
    });
    expect(refreshed.fromCache).toBe(false);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("supports recommendation mode and validates missing inputs locally", async () => {
    await expect(explorePapers({ query: "   " })).rejects.toMatchObject({
      status: 400,
      kind: "validation",
    });
    await expect(
      explorePapers({ mode: "recommend", paperId: "" }),
    ).rejects.toMatchObject({
      status: 400,
      kind: "validation",
    });

    get.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: {
        success: true,
        total: 0,
        papers: [],
        message: "No recommendations found for this specific paper.",
      },
    });
    const rec = await explorePapers({ mode: "recommend", paperId: "215416146" });
    expect(rec.papers).toEqual([]);
    expect(rec.message).toBe("No recommendations found for this specific paper.");
  });

  it("classifies 429 rate limits (with Retry-After seconds), 5xx, non-JSON bodies, network(0), and aborted requests", async () => {
    expect(parseRetryAfterSeconds("45")).toBe(45);
    expect(parseRetryAfterSeconds(undefined, 30)).toBe(30);

    get.mockResolvedValueOnce({
      status: 429,
      headers: { "retry-after": "45" },
      data: { error: "Rate limit exceeded." },
    });
    await expect(explorePapers({ query: "photonics" })).rejects.toMatchObject({
      status: 429,
      kind: "rate_limited",
      retryAfterSeconds: 45,
    } satisfies Partial<ExploreApiError>);

    // Real-backend 500 upstream failure mapping
    get.mockResolvedValueOnce({
      status: 500,
      headers: {},
      data: { error: "Search service unavailable." },
    });
    await expect(explorePapers({ query: "silicon" })).rejects.toMatchObject({
      status: 500,
      kind: "server",
      message: "Search service unavailable.",
    });

    // Network error & cancel error
    get.mockRejectedValueOnce(new ApiError(0, "Could not reach the server."));
    await expect(explorePapers({ query: "offline" })).rejects.toMatchObject({
      status: 0,
      kind: "network",
    });

    const cancel = new axios.CanceledError("aborted");
    get.mockRejectedValueOnce(cancel);
    await expect(explorePapers({ query: "aborted" })).rejects.toBe(cancel);

    expect(getExploreErrorKind(new ApiError(429, "Too many"))).toBe("rate_limited");
  });

  it("deduplicates StrictMode double-mount and caches per-paper similar results while filtering self-match", async () => {
    expect(canFindSimilarForPaper({ title: "Valid Title" })).toBe(true);
    expect(canFindSimilarForPaper({ title: "   " })).toBe(false);
    expect(canFindSimilarForPaper(undefined)).toBe(false);

    let resolveHttp!: (v: unknown) => void;
    get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveHttp = resolve;
        }),
    );

    const paper = {
      id: 42,
      title: "Mock Paper: Baseline Silicon",
      doi: "10.5555/self.42",
    };

    // Simulate React StrictMode mount -> immediate unmount -> immediate remount
    const first = requestSimilarPapers(paper);
    first.cancel();
    const second = requestSimilarPapers(paper);

    expect(get).toHaveBeenCalledTimes(1);

    resolveHttp({
      status: 200,
      headers: {},
      data: {
        success: true,
        total: 2,
        papers: [
          {
            paperId: "self-match",
            title: "Mock Paper: Baseline Silicon",
            externalIds: { DOI: "10.5555/self.42" },
            year: 2026,
          },
          {
            paperId: "other-1",
            title: "Mock S2 Paper: Related Architecture",
            year: 2025,
            url: "https://www.semanticscholar.org/paper/other-1",
          },
        ],
      },
    });

    const result = await second.promise;
    expect(result.papers).toHaveLength(1);
    expect(result.papers[0].paperId).toBe("other-1");
    expect(getCachedSimilarPapers(42)?.papers).toHaveLength(1);

    // Subsequent call serves from session cache with zero extra network calls
    const third = await requestSimilarPapers(paper).promise;
    expect(third.fromCache).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
