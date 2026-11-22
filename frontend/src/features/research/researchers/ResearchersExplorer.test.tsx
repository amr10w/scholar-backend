import { StrictMode, useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

// Next.js syncs useSearchParams with window.history.pushState; emulate that here.
const { urlStore } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    urlStore: {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      snapshot: () => window.location.search,
      emit: () => listeners.forEach((listener) => listener()),
    },
  };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(useSyncExternalStore(urlStore.subscribe, urlStore.snapshot)),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));

const { fetchResearchers, fetchResearcher, fetchScholarProfile, isNotFoundError } = vi.hoisted(
  () => ({
    fetchResearchers: vi.fn(),
    fetchResearcher: vi.fn(),
    fetchScholarProfile: vi.fn(),
    isNotFoundError: vi.fn(() => false),
  }),
);
vi.mock("./researcher.api", () => ({
  RESEARCHERS_PAGE_SIZE: 12,
  fetchResearchers,
  fetchResearcher,
  fetchScholarProfile,
  isNotFoundError,
}));

import type { Paginated } from "@/src/lib/api-client";
import ResearchersExplorer, { parseResearcherId } from "./ResearchersExplorer";
import { RESEARCHERS, makeResearcher, makeScholarProfile } from "./researcher.test-fixtures";
import type { AcademicResearcher, ResearcherFacets } from "./researcher.type";

const FACETS: ResearcherFacets = {
  topics: ["NLP", "Robotics", "VLSI"],
  departments: ["Marine Biology", "Mechatronics", "School of Sciences"],
  universities: [
    "Ain Shams University",
    "Alexandria University",
    "American University in Cairo",
  ],
};

function makePage(
  data: AcademicResearcher[],
  overrides: Partial<Paginated<AcademicResearcher>["pagination"]> = {},
): Paginated<AcademicResearcher> {
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

const originalPushState = window.history.pushState.bind(window.history);

function setUrl(search: string) {
  act(() => {
    originalPushState(null, "", `/research${search}`);
    urlStore.emit();
  });
}

/** Let the 250ms exit run, then commit the swapped-in view. */
function finishTransition() {
  act(() => vi.advanceTimersByTime(300));
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  setUrl("?tab=researchers");
  vi.spyOn(window.history, "pushState").mockImplementation((data, unused, url) => {
    originalPushState(data, unused, url);
    urlStore.emit();
  });
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  fetchResearchers.mockReset();
  fetchResearcher.mockReset();
  fetchScholarProfile.mockReset().mockResolvedValue(makeScholarProfile());
  isNotFoundError.mockReset().mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const viewProfile = (name: string) =>
  fireEvent.click(
    within(screen.getByRole("article", { name })).getByRole("button", { name: "View Profile" }),
  );

const expectCountLabel = (expected: string) =>
  expect(
    screen.getByText(
      (_, node) => node?.tagName === "P" && node.textContent?.replace(/\s+/g, " ").trim() === expected,
    ),
  ).toBeInTheDocument();

describe("parseResearcherId", () => {
  it("accepts positive integers only", () => {
    expect(parseResearcherId("12")).toBe(12);
    for (const value of [null, "", "0", "-3", "1.5", "abc", "12abc"]) {
      expect(parseResearcherId(value)).toBeNull();
    }
  });
});

describe("ResearchersExplorer", () => {
  it("renders the server first page without refetching and shows loaded-of-total count", () => {
    render(<ResearchersExplorer initialPage={makePage(RESEARCHERS)} facets={FACETS} />);
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByPlaceholderText("Search by Researcher Name")).toBeInTheDocument();
    expectCountLabel("3 of 3 researchers");
    expect(fetchResearchers).not.toHaveBeenCalled();
  });

  it("shows a skeleton when loading page 1 on the client and renders safely under StrictMode", async () => {
    let resolvePage!: (value: Paginated<AcademicResearcher>) => void;
    fetchResearchers.mockImplementation(
      () =>
        new Promise<Paginated<AcademicResearcher>>((resolve) => {
          resolvePage = resolve;
        }),
    );

    render(
      <StrictMode>
        <ResearchersExplorer facets={FACETS} />
      </StrictMode>,
    );

    expect(screen.getByRole("status", { name: "Loading researchers" })).toBeInTheDocument();
    await act(async () => {
      resolvePage(makePage(RESEARCHERS));
      await Promise.resolve();
    });

    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("debounces rapid search input, trims query, and resets on clear", async () => {
    fetchResearchers.mockResolvedValue(makePage([RESEARCHERS[1]], { total: 1, totalPages: 1 }));
    render(<ResearchersExplorer initialPage={makePage(RESEARCHERS)} facets={FACETS} />);

    const search = screen.getByRole("searchbox", { name: "Search researchers" });
    fireEvent.change(search, { target: { value: "S" } });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.change(search, { target: { value: "Sa" } });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.change(search, { target: { value: "  Sarah  " } });
    expect(fetchResearchers).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(300));
    await flushAsync();

    expect(fetchResearchers).toHaveBeenCalledTimes(1);
    expect(fetchResearchers).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 12, researcher: "  Sarah  " }),
      expect.any(AbortSignal),
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expectCountLabel("1 of 1 researchers");

    // Reset button restores unfiltered page 1
    fetchResearchers.mockResolvedValueOnce(makePage(RESEARCHERS));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    act(() => vi.advanceTimersByTime(300));
    await flushAsync();

    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("filters by topic, department, and university and resets page to 1", async () => {
    fetchResearchers.mockResolvedValue(makePage([RESEARCHERS[1]], { total: 1, totalPages: 1 }));
    render(<ResearchersExplorer initialPage={makePage(RESEARCHERS)} facets={FACETS} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Topics" }), {
      target: { value: "NLP" },
    });
    await flushAsync();

    expect(fetchResearchers).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, mainTopic: "NLP" }),
      expect.any(AbortSignal),
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Universities" }), {
      target: { value: "American University in Cairo" },
    });
    await flushAsync();

    expect(fetchResearchers).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        mainTopic: "NLP",
        institutionName: "American University in Cairo",
      }),
      expect.any(AbortSignal),
    );
  });

  it("appends pages via Load More without duplicates and hides at the last page", async () => {
    const page1 = makePage([RESEARCHERS[0], RESEARCHERS[1]], {
      total: 3,
      page: 1,
      limit: 2,
      totalPages: 2,
    });
    const page2 = makePage([RESEARCHERS[1], RESEARCHERS[2]], {
      total: 3,
      page: 2,
      limit: 2,
      totalPages: 2,
    });
    fetchResearchers.mockResolvedValueOnce(page2);

    render(<ResearchersExplorer initialPage={page1} facets={FACETS} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expectCountLabel("2 of 3 researchers");

    fireEvent.click(screen.getByRole("button", { name: "Load More" }));
    await flushAsync();

    // Duplicate id 2 from page2 is deduplicated; total cards = 3
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expectCountLabel("3 of 3 researchers");
    expect(screen.queryByRole("button", { name: "Load More" })).toBeNull();

    // Searching after Load More and then Reset must return to page 1 (not jump back to page 2)
    fetchResearchers.mockResolvedValueOnce(makePage([RESEARCHERS[0]], { total: 1, totalPages: 1 }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search researchers" }), {
      target: { value: "Raghied" },
    });
    act(() => vi.advanceTimersByTime(300));
    await flushAsync();
    expect(screen.getAllByRole("article")).toHaveLength(1);

    fetchResearchers.mockResolvedValueOnce(page1);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    act(() => vi.advanceTimersByTime(300));
    await flushAsync();

    expect(fetchResearchers).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, researcher: "" }),
      expect.any(AbortSignal),
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expectCountLabel("2 of 3 researchers");
  });

  it("keeps loaded cards when Load More fails and retries cleanly", async () => {
    const page1 = makePage([RESEARCHERS[0], RESEARCHERS[1]], {
      total: 3,
      page: 1,
      limit: 2,
      totalPages: 2,
    });
    fetchResearchers.mockRejectedValueOnce(new Error("Simulated error (500)"));

    render(<ResearchersExplorer initialPage={page1} facets={FACETS} />);
    fireEvent.click(screen.getByRole("button", { name: "Load More" }));
    await flushAsync();

    // Existing 2 cards stay visible alongside the inline error
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent("Simulated error (500)");

    // Retry succeeds and appends page 2
    fetchResearchers.mockResolvedValueOnce(
      makePage([RESEARCHERS[2]], { total: 3, page: 2, limit: 2, totalPages: 2 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flushAsync();

    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ignores stale responses when a newer search resolves first (race safety)", async () => {
    let resolveSlow!: (v: Paginated<AcademicResearcher>) => void;
    let resolveFast!: (v: Paginated<AcademicResearcher>) => void;

    fetchResearchers
      .mockImplementationOnce(
        (_q: unknown, signal?: AbortSignal) =>
          new Promise<Paginated<AcademicResearcher>>((resolve) => {
            resolveSlow = resolve;
            signal?.addEventListener("abort", () => {});
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Paginated<AcademicResearcher>>((resolve) => {
            resolveFast = resolve;
          }),
      );

    render(<ResearchersExplorer initialPage={makePage(RESEARCHERS)} facets={FACETS} />);
    const search = screen.getByRole("searchbox", { name: "Search researchers" });

    fireEvent.change(search, { target: { value: "Hassan" } });
    act(() => vi.advanceTimersByTime(300));

    fireEvent.change(search, { target: { value: "Omar" } });
    act(() => vi.advanceTimersByTime(300));

    // Newer query resolves first
    await act(async () => {
      resolveFast(makePage([RESEARCHERS[2]], { total: 1, totalPages: 1 }));
      await Promise.resolve();
    });
    // Older query resolves late (its signal was aborted)
    await act(async () => {
      resolveSlow(makePage([RESEARCHERS[0]], { total: 1, totalPages: 1 }));
      await Promise.resolve();
    });

    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: "Omar Morsi" })).toBeInTheDocument();
  });

  it("opens the clicked researcher's profile and keeps other params", () => {
    render(<ResearchersExplorer initialPage={makePage(RESEARCHERS)} facets={FACETS} />);

    viewProfile("Sarah El-Ghandour");
    expect(window.location.search).toBe("?tab=researchers&researcher=2");
    expect(screen.getAllByRole("article")).toHaveLength(3);

    finishTransition();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 2, name: "Sarah El-Ghandour" })).toBeInTheDocument();
    expect(fetchResearcher).not.toHaveBeenCalled();
    expect(fetchScholarProfile).toHaveBeenCalledWith(RESEARCHERS[1], expect.any(AbortSignal));
  });

  it("opens the correct profile for every card", () => {
    render(<ResearchersExplorer initialPage={makePage(RESEARCHERS)} facets={FACETS} />);

    for (const researcher of RESEARCHERS) {
      const name = `${researcher.firstName} ${researcher.lastName}`;
      viewProfile(name);
      finishTransition();
      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(name);

      fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
      finishTransition();
      expect(screen.getAllByRole("article")).toHaveLength(3);
    }
    expect(window.location.search).toBe("?tab=researchers");
  });

  it("applies symmetric enter/exit motion classes", () => {
    const { container } = render(
      <ResearchersExplorer initialPage={makePage(RESEARCHERS)} facets={FACETS} />,
    );
    const view = () => container.querySelector("[class*='transition-[opacity,translate]']")!;

    expect(view().className).toContain("starting:-translate-x-6");
    viewProfile("Raghied Atta");
    expect(view().className).toContain("-translate-x-6 ");
    expect(view()).toHaveAttribute("aria-busy", "true");

    finishTransition();
    expect(view().className).toContain("starting:translate-x-6");
    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    expect(view().className).toMatch(/(^|\s)translate-x-6(\s|$)/);
  });

  it("settles on the last researcher when switching rapidly", () => {
    render(<ResearchersExplorer initialPage={makePage(RESEARCHERS)} facets={FACETS} />);

    viewProfile("Raghied Atta");
    act(() => vi.advanceTimersByTime(100));
    setUrl("?tab=researchers&researcher=3");
    finishTransition();

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Omar Morsi");
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
  });

  it("returns to the grid when the browser goes back mid-exit", () => {
    render(<ResearchersExplorer initialPage={makePage(RESEARCHERS)} facets={FACETS} />);

    viewProfile("Raghied Atta");
    setUrl("?tab=researchers");
    finishTransition();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Back to list" })).toBeNull();
  });

  it("restores the profile from the URL on refresh, fetching the row by id", async () => {
    setUrl("?tab=researchers&researcher=42");
    fetchResearcher.mockResolvedValue({ ...RESEARCHERS[1], id: 42 });
    render(<ResearchersExplorer initialPage={makePage(RESEARCHERS)} facets={FACETS} />);

    expect(screen.queryAllByRole("article")).toHaveLength(0);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(fetchResearcher).toHaveBeenCalledWith(42, expect.any(AbortSignal));
    expect(screen.getByRole("heading", { level: 2, name: "Sarah El-Ghandour" })).toBeInTheDocument();
  });

  it("ignores a malformed researcher param", () => {
    setUrl("?tab=researchers&researcher=abc");
    render(<ResearchersExplorer initialPage={makePage(RESEARCHERS)} facets={FACETS} />);
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("shows the list error with retry, and still opens profiles by URL", async () => {
    render(
      <ResearchersExplorer
        initialPage={null}
        facets={FACETS}
        initialError="Failed to fetch researchers"
      />,
    );
    expect(screen.getByText("Researchers Are Unavailable")).toBeInTheDocument();
    expect(screen.getByText("Failed to fetch researchers")).toBeInTheDocument();

    fetchResearchers.mockResolvedValueOnce(makePage([makeResearcher({ id: 9 })]));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flushAsync();
    expect(screen.getAllByRole("article")).toHaveLength(1);

    fetchResearcher.mockReturnValue(new Promise(() => {}));
    setUrl("?tab=researchers&researcher=5");
    finishTransition();
    expect(screen.getByText("Loading researcher…")).toBeInTheDocument();
  });

  it("shows an empty state with reset when no researchers match filters", async () => {
    fetchResearchers.mockResolvedValueOnce(makePage([], { total: 0, totalPages: 0 }));
    render(<ResearchersExplorer initialPage={makePage(RESEARCHERS)} facets={FACETS} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search researchers" }), {
      target: { value: "NobodyHere" },
    });
    act(() => vi.advanceTimersByTime(300));
    await flushAsync();

    expect(screen.getByText("No Researchers Found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset filters" })).toBeInTheDocument();
  });

  it("falls back to the existing empty state when there are no researchers", () => {
    render(<ResearchersExplorer initialPage={makePage([])} facets={FACETS} />);
    expect(screen.getByText("Find What You're Looking For")).toBeInTheDocument();
  });
});
