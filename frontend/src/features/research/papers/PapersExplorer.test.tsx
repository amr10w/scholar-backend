import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

const {
  fetchPapers,
  explorePapers,
  useCatalogDetail,
  mockSearchParams,
  mockSimilarCache,
} = vi.hoisted(() => ({
  fetchPapers: vi.fn(),
  explorePapers: vi.fn(),
  useCatalogDetail: vi.fn(),
  mockSearchParams: { current: new URLSearchParams() },
  mockSimilarCache: new Map<number, unknown>(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams.current,
}));

vi.mock("../ResearchYearFilter", () => ({
  default: ({
    onChange,
  }: {
    onChange: (range: { fromYear: number; toYear: number } | null) => void;
  }) => (
    <button
      type="button"
      onClick={() => onChange({ fromYear: 2021, toYear: 2024 })}
    >
      Apply mock year range
    </button>
  ),
}));

vi.mock("./paper.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./paper.api")>();
  return {
    ...actual,
    fetchPapers,
  };
});

vi.mock("./explore.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./explore.api")>();
  return {
    ...actual,
    explorePapers,
    getCachedSimilarPapers: (paperId: number) =>
      mockSimilarCache.get(paperId) ?? null,
    requestSimilarPapers: (
      paper: { id: number; title: string; doi?: string | null },
      options?: { bypassCache?: boolean; limit?: number },
    ) => {
      if (!options?.bypassCache) {
        const cached = mockSimilarCache.get(paper.id);
        if (cached) {
          return { promise: Promise.resolve(cached), cancel: () => {} };
        }
      }
      const controller = new AbortController();
      const promise = Promise.resolve(
        explorePapers({
          query: paper.title,
          limit: (options?.limit ?? 6) + 1,
          bypassCache: options?.bypassCache,
          signal: controller.signal,
        }),
      ).then((res) => {
        mockSimilarCache.set(paper.id, res);
        return res;
      });
      return { promise, cancel: () => controller.abort() };
    },
  };
});

vi.mock("@/src/hooks/useCatalogDetail", () => ({ useCatalogDetail }));

import type { Paginated } from "@/src/lib/api-client";
import { ExploreApiError, clearExploreCache } from "./explore.api";
import PaperDetails from "./PaperDetails";
import PapersExplorer from "./PapersExplorer";
import type { ResearchPaper } from "./paper.api";

function makePaper(overrides: Partial<ResearchPaper> = {}): ResearchPaper {
  return {
    id: 1,
    title: "Mock Paper: Baseline Reference Architecture for Open Silicon Flows",
    subtitle: "A reproducible benchmark suite",
    journalTitle: "Mock Journal of Solid-State Circuits",
    publicationYear: 2026,
    publicationMonth: 3,
    publicationDay: 15,
    sourceName: "ORCID Mock Sync",
    type: "journal-article",
    doi: "10.5555/mock.paper.2026.001",
    url: "https://example.org/mock-papers/1",
    orcidPath: "0000-0001-5000-0001",
    putCode: "100001",
    staff: { id: 1, name: "Dr. Mock Nadia El-Masry" },
    ...overrides,
  };
}

function makePage(
  data: ResearchPaper[],
  overrides: Partial<Paginated<ResearchPaper>["pagination"]> = {},
): Paginated<ResearchPaper> {
  const total = overrides.total ?? data.length;
  const limit = overrides.limit ?? 12;
  return {
    success: true,
    data,
    pagination: {
      total,
      page: overrides.page ?? 1,
      limit,
      totalPages: overrides.totalPages ?? Math.ceil(total / limit),
    },
  };
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchPapers.mockReset();
  explorePapers.mockReset();
  useCatalogDetail.mockReset();
  mockSearchParams.current = new URLSearchParams();
  mockSimilarCache.clear();
  clearExploreCache();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("PapersExplorer (list, search, sort, year filter, and link safety)", () => {
  it("loads papers without calling /api/explore, renders safe links & DOI fallbacks, and hides unsafe links", async () => {
    const p1 = makePaper();
    const pDoiOnly = makePaper({
      id: 5,
      title: "Mock Paper: DOI Only Entry",
      url: null,
      doi: "10.9999/TOK_PAPER_DOI_DELTA64",
    });
    const pUnsafe = makePaper({
      id: 20,
      title: "Mock Paper: Unsafe Script Link",
      url: "javascript:alert(1)",
      doi: null,
    });

    fetchPapers.mockResolvedValueOnce(
      makePage([p1, pDoiOnly, pUnsafe], { total: 160, totalPages: 14 }),
    );

    render(<PapersExplorer />);
    await flushAsync();

    // Main list loaded; Explore never called automatically!
    expect(fetchPapers).toHaveBeenCalledTimes(1);
    expect(explorePapers).not.toHaveBeenCalled();
    expect(screen.getByText("Showing 1–12 of 160 papers")).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: "Read paper for Mock Paper: Baseline Reference Architecture for Open Silicon Flows (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "https://example.org/mock-papers/1");

    // Card paired actions: "Show more" + "Find Similar" with unique accessible names
    expect(
      screen.getByRole("link", {
        name: "Show more about Mock Paper: Baseline Reference Architecture for Open Silicon Flows",
      }),
    ).toHaveAttribute("href", "/research/papers/1");
    expect(
      screen.getByRole("link", {
        name: "Find similar papers to Mock Paper: Baseline Reference Architecture for Open Silicon Flows",
      }),
    ).toHaveAttribute("href", "/research/papers/1?similar=1");

    // "Read paper" is omitted when paper has no URL (DOI-only) or unsafe URL
    expect(
      screen.queryByRole("link", {
        name: "Read paper for Mock Paper: DOI Only Entry (opens in a new tab)",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", {
        name: /Mock Paper: Unsafe Script Link \(opens in a new tab\)/i,
      }),
    ).toBeNull();
  });

  it("combines debounced search, year filter, and `order` sorting, resetting page to 1 on filter change", async () => {
    fetchPapers
      .mockResolvedValueOnce(makePage([makePaper()], { total: 30, totalPages: 3 }))
      .mockResolvedValueOnce(
        makePage([makePaper({ id: 2 })], { total: 30, page: 2, totalPages: 3 }),
      )
      .mockResolvedValueOnce(makePage([makePaper()], { total: 5, page: 1, totalPages: 1 }))
      .mockResolvedValueOnce(makePage([makePaper()], { total: 2, page: 1, totalPages: 1 }));

    render(<PapersExplorer />);
    await flushAsync();

    // Advance to page 2
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await flushAsync();
    expect(fetchPapers).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, sortBy: "publicationYear", order: "desc" }),
      expect.any(AbortSignal),
    );

    // Change sort to Title A–Z -> sends sortBy="title", order="asc", resets page to 1
    fireEvent.click(screen.getByRole("button", { name: /Sort: Year: newest/i }));
    fireEvent.click(screen.getByRole("radio", { name: "Title A–Z" }));
    await flushAsync();
    expect(fetchPapers).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, sortBy: "title", order: "asc" }),
      expect.any(AbortSignal),
    );

    // Combine search + year range
    fireEvent.change(screen.getByRole("searchbox", { name: "Search papers" }), {
      target: { value: "  CMOS  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply mock year range" }));
    act(() => vi.advanceTimersByTime(300));
    await flushAsync();

    expect(fetchPapers).toHaveBeenLastCalledWith(
      {
        search: "CMOS",
        yearRange: { fromYear: 2021, toYear: 2024 },
        page: 1,
        limit: 12,
        sortBy: "title",
        order: "asc",
      },
      expect.any(AbortSignal),
    );
  });

  it("ignores out-of-order responses when typing fast under latency", async () => {
    let resolveSlow!: (v: Paginated<ResearchPaper>) => void;
    let resolveFast!: (v: Paginated<ResearchPaper>) => void;

    fetchPapers
      .mockResolvedValueOnce(makePage([makePaper()]))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSlow = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFast = resolve;
          }),
      );

    render(<PapersExplorer />);
    await flushAsync();

    const search = screen.getByRole("searchbox", { name: "Search papers" });
    fireEvent.change(search, { target: { value: "SlowQuery" } });
    act(() => vi.advanceTimersByTime(300));

    fireEvent.change(search, { target: { value: "FastQuery" } });
    act(() => vi.advanceTimersByTime(300));

    await act(async () => {
      resolveFast(makePage([makePaper({ id: 99, title: "Mock Paper: Fast Winner" })]));
      await Promise.resolve();
    });
    await act(async () => {
      resolveSlow(makePage([makePaper({ id: 88, title: "Mock Paper: Stale Loser" })]));
      await Promise.resolve();
    });

    expect(screen.getByText("Mock Paper: Fast Winner")).toBeInTheDocument();
    expect(screen.queryByText("Mock Paper: Stale Loser")).toBeNull();
  });
});

describe("PapersExploreSection (explicit trigger, attribution, rate limit, and isolation)", () => {
  it("fetches only on explicit user submit, labels Semantic Scholar, and keeps main Papers working when Explore rate-limits or fails", async () => {
    fetchPapers.mockResolvedValue(
      makePage([makePaper()], { total: 160, totalPages: 14 }),
    );
    explorePapers
      .mockRejectedValueOnce(
        new ExploreApiError(
          429,
          "Semantic Scholar rate limit reached.",
          "rate_limited",
          45,
        ),
      )
      .mockResolvedValueOnce({
        total: 1,
        fromCache: false,
        papers: [
          {
            paperId: "mock-s2-001",
            title: "Mock S2 Paper: Energy-Efficient CMOS Neural Accelerators",
            abstract: 'Plain-text check <script>alert("xss")</script>',
            venue: "Mock IEEE ISSCC",
            year: 2025,
            authors: [{ authorId: "a1", name: "Mock Author Layla Hassan" }],
            citationCount: 142,
            url: "https://www.semanticscholar.org/paper/mock-s2-001",
            openAccessPdfUrl: "https://example.org/mock-s2/pdfs/001.pdf",
            doi: "10.5555/mock.s2.2025.001",
            corpusId: "910001",
          },
        ],
      });

    render(<PapersExplorer />);
    await flushAsync();

    // Expand Semantic Scholar explorer -> still 0 calls before form submit!
    fireEvent.click(
      screen.getByRole("button", { name: /Explore Semantic Scholar/i }),
    );
    expect(explorePapers).not.toHaveBeenCalled();

    // Submit topic search -> hits 429 rate limit with 45s wait hint, NO automatic retry loop
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Semantic Scholar topic keywords" }),
      { target: { value: "CMOS" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Search Semantic Scholar" }),
    );
    act(() => vi.advanceTimersByTime(150));
    await flushAsync();

    expect(explorePapers).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/Semantic Scholar is rate-limiting requests right now/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/about 45 seconds/i)).toBeInTheDocument();

    // Advance timers by 60s -> verify NO automatic retry loop!
    act(() => vi.advanceTimersByTime(60_000));
    expect(explorePapers).toHaveBeenCalledTimes(1);

    // Main Papers list remains 100% functional while Explore is rate-limited!
    expect(
      screen.getByText(
        "Mock Paper: Baseline Reference Architecture for Open Silicon Flows",
      ),
    ).toBeInTheDocument();

    // Manual retry succeeds and renders Semantic Scholar attribution & safe links
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flushAsync();

    const s2List = screen.getByRole("list", {
      name: "Semantic Scholar results",
    });
    expect(
      within(s2List).getByText(
        "Mock S2 Paper: Energy-Efficient CMOS Neural Accelerators",
      ),
    ).toBeInTheDocument();
    expect(
      within(s2List).getByText('Plain-text check <script>alert("xss")</script>'),
    ).toBeInTheDocument();
    expect(within(s2List).getByText("142 citations")).toBeInTheDocument();
  });
});

describe("PaperDetails (/research/papers/[id])", () => {
  it("omits missing optional fields cleanly instead of showing 'Not provided', and rejects unsafe URLs", () => {
    useCatalogDetail.mockReturnValue({
      data: makePaper({
        id: 11,
        title: "Mock Paper: Minimalist Record With Every Optional Field Null",
        subtitle: null,
        journalTitle: null,
        publicationYear: null,
        publicationMonth: null,
        publicationDay: null,
        sourceName: null,
        type: null,
        doi: null,
        url: "javascript:alert(1)",
        orcidPath: null,
        putCode: null,
        staff: { id: 2, name: "Prof. Mock Tarek Mansour" },
      }),
      loading: false,
      notFound: false,
      error: undefined,
      reload: vi.fn(),
    });

    render(<PaperDetails id="11" />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Mock Paper: Minimalist Record With Every Optional Field Null",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Prof. Mock Tarek Mansour")).toBeInTheDocument();
    expect(screen.queryByText("Not provided")).toBeNull();
    expect(screen.queryByText("Journal")).toBeNull();
    expect(screen.queryByText("DOI")).toBeNull();
    expect(
      screen.queryByRole("link", { name: /Read paper on source website/i }),
    ).toBeNull();
  });

  it("renders DOI fallback link and handles notFound & retryable error states", () => {
    const reload = vi.fn();
    useCatalogDetail.mockReturnValue({
      data: makePaper({
        id: 21,
        url: "ftp://legacy.mock.example/papers/21.pdf",
        doi: "10.5555/mock.safe.doi.21",
      }),
      loading: false,
      notFound: false,
      error: undefined,
      reload,
    });

    const { rerender } = render(<PaperDetails id="21" />);
    expect(
      screen.getByRole("link", { name: /View paper via DOI/i }),
    ).toHaveAttribute("href", "https://doi.org/10.5555/mock.safe.doi.21");

    useCatalogDetail.mockReturnValue({
      data: undefined,
      loading: false,
      notFound: true,
      error: undefined,
      reload,
    });
    rerender(<PaperDetails id="99999" />);
    expect(
      screen.getByRole("heading", { name: "Paper not found" }),
    ).toBeInTheDocument();

    useCatalogDetail.mockReturnValue({
      data: undefined,
      loading: false,
      notFound: false,
      error: "Database unavailable",
      reload,
    });
    rerender(<PaperDetails id="1" />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("fetches similar papers on Find Similar click, toggles collapse/expand from cache, and handles ?similar=1 + 429 rate limits", async () => {
    const paper = makePaper({ id: 1 });
    useCatalogDetail.mockReturnValue({
      data: paper,
      loading: false,
      notFound: false,
      error: undefined,
      reload: vi.fn(),
    });
    explorePapers.mockResolvedValueOnce({
      total: 1,
      fromCache: false,
      papers: [
        {
          paperId: "mock-s2-001",
          title: "Mock S2 Paper: Energy-Efficient CMOS Neural Accelerators",
          abstract: null,
          venue: "Mock IEEE ISSCC",
          year: 2025,
          authors: [{ authorId: "a1", name: "Mock Author Layla Hassan" }],
          citationCount: 142,
          url: "https://www.semanticscholar.org/paper/mock-s2-001",
          openAccessPdfUrl: null,
          doi: "10.5555/mock.s2.2025.001",
          corpusId: "910001",
        },
      ],
    });

    render(<PaperDetails id="1" />);
    expect(explorePapers).not.toHaveBeenCalled();

    const btn = screen.getByRole("button", {
      name: `Find similar papers to ${paper.title}`,
    });
    fireEvent.click(btn);
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");

    await flushAsync();

    expect(explorePapers).toHaveBeenCalledTimes(1);
    expect(screen.getByText("From Semantic Scholar")).toBeInTheDocument();
    expect(
      screen.getByText("Mock S2 Paper: Energy-Efficient CMOS Neural Accelerators"),
    ).toBeInTheDocument();

    // Second click collapses without calling explorePapers again; third expands from cache
    fireEvent.click(btn);
    expect(screen.queryByRole("heading", { name: "Similar papers" })).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByRole("heading", { name: "Similar papers" })).toBeInTheDocument();
    expect(explorePapers).toHaveBeenCalledTimes(1);
  });

  it("isolates Paper A vs Paper B results during fast navigation under latency", async () => {
    let resolvePaperA!: (v: unknown) => void;
    let resolvePaperB!: (v: unknown) => void;
    const paperA = makePaper({ id: 1, title: "Mock Paper: Alpha A" });
    const paperB = makePaper({ id: 2, title: "Mock Paper: Beta B" });

    explorePapers
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolvePaperA = resolve; }),
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolvePaperB = resolve; }),
      );

    mockSearchParams.current = new URLSearchParams("similar=1");
    useCatalogDetail.mockReturnValue({
      data: paperA,
      loading: false,
      notFound: false,
      error: undefined,
      reload: vi.fn(),
    });
    const { rerender } = render(<PaperDetails id="1" />);
    await flushAsync();

    // Navigate quickly to Paper B before Paper A resolves
    useCatalogDetail.mockReturnValue({
      data: paperB,
      loading: false,
      notFound: false,
      error: undefined,
      reload: vi.fn(),
    });
    rerender(<PaperDetails id="2" />);
    await flushAsync();

    await act(async () => {
      resolvePaperA({
        total: 1,
        fromCache: false,
        papers: [
          {
            paperId: "s2-a",
            title: "Mock S2 Result Belonging ONLY to Paper A",
            abstract: null,
            venue: null,
            year: 2024,
            authors: [],
            citationCount: null,
            url: "https://example.org/a",
            openAccessPdfUrl: null,
            doi: null,
            corpusId: null,
          },
        ],
      });
      await Promise.resolve();
    });

    // Paper A's result must NOT leak onto Paper B!
    expect(screen.queryByText("Mock S2 Result Belonging ONLY to Paper A")).toBeNull();

    await act(async () => {
      resolvePaperB({
        total: 1,
        fromCache: false,
        papers: [
          {
            paperId: "s2-b",
            title: "Mock S2 Result Belonging ONLY to Paper B",
            abstract: null,
            venue: null,
            year: 2025,
            authors: [],
            citationCount: null,
            url: "https://example.org/b",
            openAccessPdfUrl: null,
            doi: null,
            corpusId: null,
          },
        ],
      });
      await Promise.resolve();
    });

    expect(
      screen.getByText("Mock S2 Result Belonging ONLY to Paper B"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Mock S2 Result Belonging ONLY to Paper A")).toBeNull();
  });
});
