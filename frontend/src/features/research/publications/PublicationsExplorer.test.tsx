import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/dynamic", () => ({ default: () => () => null }));

const { fetchPublications } = vi.hoisted(() => ({
  fetchPublications: vi.fn(),
}));

vi.mock("./publication.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./publication.api")>();
  return {
    ...actual,
    fetchPublications,
  };
});

vi.mock("./PublicationFilterBar", () => ({
  default: () => <div data-testid="publication-filter-bar" />,
}));

import { useCatalogDetail } from "@/src/hooks/useCatalogDetail";
import type { Paginated } from "@/src/lib/api-client";
import PublicationDetails from "./PublicationDetails";
import PublicationsExplorer from "./PublicationsExplorer";
import type { Publication } from "./publication.type";

vi.mock("@/src/hooks/useCatalogDetail", () => ({ useCatalogDetail: vi.fn() }));

function makePub(overrides: Partial<Publication> = {}): Publication {
  return {
    id: 1,
    subCategoryId: 5,
    title: "Journal of Artificial Intelligence Research",
    acronym: "JAIR",
    publisher: "ACM",
    publicationType: "Journal",
    openAccessType: "Full_Open_Access",
    workflow: "standard",
    issn: "10769757",
    eissn: "1943-5037",
    issnCdrom: null,
    URL: "https://jair.org",
    yearLunched: 1993,
    launchYear: 1993,
    specificFocusScope: "Foundational and applied AI research",
    licenseType: "CC_BY",
    journalScope: "Peer-reviewed articles across all areas of AI.",
    imprint: "AI Access Foundation",
    subBucket: "CoreGold",
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z",
    subCategory: { id: 5, domainId: 1, name: "Artificial Intelligence" },
    ...overrides,
  };
}

const PUB_JAIR = makePub();
const PUB_MINIMAL = makePub({
  id: 11,
  title: "Mock Minimalist Publication Without Optional Metadata",
  acronym: null,
  publisher: "Oxford",
  publicationType: "Journal",
  openAccessType: "Subscriber_Based_Access",
  workflow: "non_standard",
  issn: null,
  eissn: null,
  issnCdrom: null,
  URL: null,
  yearLunched: null,
  launchYear: null,
  specificFocusScope: null,
  licenseType: null,
  journalScope: null,
  imprint: null,
  subBucket: null,
  subCategory: {
    id: 1,
    domainId: 1,
    name: "Computer Vision & Pattern Recognition",
  },
});
const PUB_UNSAFE_URL = makePub({
  id: 20,
  title: "Mock Legacy FTP Archive Journal",
  acronym: "MLFAJ",
  URL: "ftp://legacy-archive.example.org/journal",
});

function makePage(
  data: Publication[],
  overrides: Partial<Paginated<Publication>["pagination"]> = {},
): Paginated<Publication> {
  const total = overrides.total ?? data.length;
  const limit = overrides.limit ?? 10;
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
  fetchPublications.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("PublicationsExplorer (CatalogLayout theme)", () => {
  it("renders initial page cards without refetching, links to /research?tab=publications&publication=:id, and hides unsafe URLs", () => {
    render(
      <PublicationsExplorer
        initialPage={makePage([PUB_JAIR, PUB_MINIMAL, PUB_UNSAFE_URL], {
          total: 200,
          totalPages: 20,
        })}
      />,
    );

    expect(fetchPublications).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("200 publications");
    expect(screen.getByText(/JAIR · ACM · 1993/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Show more about Journal of Artificial Intelligence Research",
      }),
    ).toHaveAttribute("href", "/research?tab=publications&publication=1");

    expect(
      screen.getByRole("link", {
        name: "Publisher website for Journal of Artificial Intelligence Research (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "https://jair.org/");
    expect(
      screen.queryByRole("link", {
        name: "Publisher website for Mock Legacy FTP Archive Journal (opens in a new tab)",
      }),
    ).toBeNull();
  });

  it("debounces search and fetches page changes", async () => {
    fetchPublications.mockResolvedValue(
      makePage([PUB_JAIR], { total: 1, totalPages: 1 }),
    );
    render(
      <PublicationsExplorer
        initialPage={makePage([PUB_JAIR, PUB_MINIMAL], {
          total: 20,
          totalPages: 2,
        })}
      />,
    );

    fetchPublications.mockResolvedValueOnce(
      makePage([PUB_MINIMAL], { total: 20, page: 2, totalPages: 2 }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await flushAsync();
    expect(fetchPublications).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
      expect.any(AbortSignal),
    );

    const search = screen.getByRole("searchbox", {
      name: "Search publications",
    });
    fireEvent.change(search, { target: { value: "JA" } });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.change(search, { target: { value: "JAIR" } });
    act(() => vi.advanceTimersByTime(300));
    await flushAsync();

    expect(fetchPublications).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "JAIR", page: 1 }),
      expect.any(AbortSignal),
    );
  });

  it("shows error state and retries cleanly when Try again is clicked", async () => {
    fetchPublications
      .mockRejectedValueOnce(new Error("Simulated 500 failure"))
      .mockResolvedValueOnce(makePage([PUB_JAIR], { total: 1, totalPages: 1 }));

    render(<PublicationsExplorer initialPage={makePage([PUB_JAIR])} />);
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search publications" }),
      { target: { value: "FailMe" } },
    );
    act(() => vi.advanceTimersByTime(300));
    await flushAsync();

    expect(
      screen.getByText("Couldn't load publications"),
    ).toBeInTheDocument();
    expect(screen.getByText("Simulated 500 failure")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flushAsync();

    expect(
      screen.getByText("Journal of Artificial Intelligence Research"),
    ).toBeInTheDocument();
  });
});

describe("PublicationDetails (/research/publications/[id])", () => {
  it("formats 8-character ISSNs as XXXX-XXXX and renders publication metadata", () => {
    vi.mocked(useCatalogDetail).mockReturnValue({
      data: makePub({
        issn: "10769757",
        eissn: "2041172x",
        issnCdrom: "2088-776X",
      }),
      loading: false,
      error: undefined,
      notFound: false,
      reload: vi.fn(),
    });

    render(<PublicationDetails id="1" />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Journal of Artificial Intelligence Research",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("1076-9757")).toBeInTheDocument();
    expect(screen.getByText("2041-172X")).toBeInTheDocument();
    expect(screen.getByText("2088-776X")).toBeInTheDocument();
    expect(screen.getByText("1993")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Visit publication website/i }),
    ).toHaveAttribute("href", "https://jair.org/");
  });

  it("renders researcher-style not-found and error states with Back to list", () => {
    const reload = vi.fn();
    const onBack = vi.fn();
    vi.mocked(useCatalogDetail).mockReturnValue({
      data: undefined,
      loading: false,
      error: "Database timeout",
      notFound: false,
      reload,
    });

    const { rerender } = render(<PublicationDetails id="1" onBack={onBack} />);
    expect(
      screen.getByRole("heading", { name: "Publication unavailable" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    expect(onBack).toHaveBeenCalledTimes(1);

    vi.mocked(useCatalogDetail).mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      notFound: true,
      reload,
    });
    rerender(<PublicationDetails id="99999" onBack={onBack} />);
    expect(
      screen.getByRole("heading", { name: "Publication not found" }),
    ).toBeInTheDocument();
  });

  it("omits missing optional fields cleanly without showing 'Not provided'", () => {
    vi.mocked(useCatalogDetail).mockReturnValue({
      data: PUB_MINIMAL,
      loading: false,
      error: undefined,
      notFound: false,
      reload: vi.fn(),
    });

    render(<PublicationDetails id="11" />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Mock Minimalist Publication Without Optional Metadata",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Not provided")).toBeNull();
    expect(screen.queryByText("ISSN")).toBeNull();
    expect(screen.queryByText("eISSN")).toBeNull();
    expect(screen.queryByText("Imprint")).toBeNull();
    expect(
      screen.queryByRole("link", { name: /Visit publication website/i }),
    ).toBeNull();
  });
});
