import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/dynamic", () => ({ default: () => () => null }));

const { fetchPublications, fetchPublication, isPublicationNotFound } = vi.hoisted(() => ({
  fetchPublications: vi.fn(),
  fetchPublication: vi.fn(),
  isPublicationNotFound: vi.fn(
    (cause: unknown) => cause instanceof ApiError && cause.status === 404,
  ),
}));

vi.mock("./publication.api", () => ({
  PUBLICATIONS_PAGE_SIZE: 10,
  fetchPublications,
  fetchPublication,
  isPublicationNotFound,
}));

import { ApiError, type Paginated } from "@/src/lib/api-client";
import PublicationsExplorer from "./PublicationsExplorer";
import type { Publication } from "./publication.type";

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
  launchYear: null,
  specificFocusScope: null,
  licenseType: null,
  journalScope: null,
  imprint: null,
  subBucket: null,
  subCategory: { id: 1, domainId: 1, name: "Computer Vision & Pattern Recognition" },
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
  fetchPublication.mockReset();
  isPublicationNotFound
    .mockReset()
    .mockImplementation((cause: unknown) => cause instanceof ApiError && cause.status === 404);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("PublicationsExplorer list & controls", () => {
  it("renders initial page without refetching, shows launchYear, and hides unsafe URLs", () => {
    render(
      <PublicationsExplorer
        initialPage={makePage([PUB_JAIR, PUB_MINIMAL, PUB_UNSAFE_URL], {
          total: 200,
          totalPages: 20,
        })}
      />,
    );

    expect(fetchPublications).not.toHaveBeenCalled();
    expect(screen.getByText("200 publications")).toBeInTheDocument();
    expect(screen.getByText(/JAIR · ACM · 1993/)).toBeInTheDocument();

    // JAIR has a safe https external link; FTP journal does not
    expect(
      screen.getByRole("link", {
        name: "Visit Journal of Artificial Intelligence Research website",
      }),
    ).toHaveAttribute("href", "https://jair.org");
    expect(
      screen.queryByRole("link", {
        name: "Visit Mock Legacy FTP Archive Journal website",
      }),
    ).toBeNull();
  });

  it("debounces search, supports sortBy and sortOrder, and resets page to 1", async () => {
    fetchPublications.mockResolvedValue(makePage([PUB_JAIR], { total: 1, totalPages: 1 }));
    render(
      <PublicationsExplorer
        initialPage={makePage([PUB_JAIR, PUB_MINIMAL], { total: 20, totalPages: 2 })}
      />,
    );

    // Move to page 2 first
    fetchPublications.mockResolvedValueOnce(
      makePage([PUB_MINIMAL], { total: 20, page: 2, totalPages: 2 }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await flushAsync();
    expect(fetchPublications).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, sortBy: "id", sortOrder: "asc" }),
      expect.any(AbortSignal),
    );

    // Changing sortBy resets page to 1
    fetchPublications.mockResolvedValueOnce(
      makePage([PUB_JAIR], { total: 20, page: 1, totalPages: 2 }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Sort publications by" }), {
      target: { value: "yearLunched" },
    });
    await flushAsync();
    expect(fetchPublications).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, sortBy: "yearLunched", sortOrder: "asc" }),
      expect.any(AbortSignal),
    );

    // Changing sortOrder
    fetchPublications.mockResolvedValueOnce(
      makePage([PUB_JAIR], { total: 20, page: 1, totalPages: 2 }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Sort order" }), {
      target: { value: "desc" },
    });
    await flushAsync();
    expect(fetchPublications).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, sortBy: "yearLunched", sortOrder: "desc" }),
      expect.any(AbortSignal),
    );

    // Debounced search
    const search = screen.getByRole("searchbox", { name: "Search publications" });
    fireEvent.change(search, { target: { value: "JA" } });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.change(search, { target: { value: "JAIR" } });
    act(() => vi.advanceTimersByTime(300));
    await flushAsync();

    expect(fetchPublications).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: "JAIR",
        page: 1,
        sortBy: "yearLunched",
        sortOrder: "desc",
      }),
      expect.any(AbortSignal),
    );
  });

  it("ignores out-of-order responses when a newer search resolves first", async () => {
    let resolveSlow!: (v: Paginated<Publication>) => void;
    let resolveFast!: (v: Paginated<Publication>) => void;

    fetchPublications
      .mockImplementationOnce(
        () =>
          new Promise<Paginated<Publication>>((resolve) => {
            resolveSlow = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Paginated<Publication>>((resolve) => {
            resolveFast = resolve;
          }),
      );

    render(<PublicationsExplorer initialPage={makePage([PUB_JAIR, PUB_MINIMAL])} />);
    const search = screen.getByRole("searchbox", { name: "Search publications" });

    fireEvent.change(search, { target: { value: "SlowQuery" } });
    act(() => vi.advanceTimersByTime(300));

    fireEvent.change(search, { target: { value: "FastQuery" } });
    act(() => vi.advanceTimersByTime(300));

    await act(async () => {
      resolveFast(makePage([PUB_MINIMAL], { total: 1, totalPages: 1 }));
      await Promise.resolve();
    });
    await act(async () => {
      resolveSlow(makePage([PUB_JAIR], { total: 1, totalPages: 1 }));
      await Promise.resolve();
    });

    expect(
      screen.getByRole("button", {
        name: "Mock Minimalist Publication Without Optional Metadata",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Journal of Artificial Intelligence Research",
      }),
    ).toBeNull();
  });

  it("shows error state and retries cleanly when Try again is clicked", async () => {
    fetchPublications
      .mockRejectedValueOnce(new Error("Simulated 500 failure"))
      .mockResolvedValueOnce(makePage([PUB_JAIR], { total: 1, totalPages: 1 }));

    render(<PublicationsExplorer initialPage={makePage([PUB_JAIR])} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search publications" }), {
      target: { value: "FailMe" },
    });
    act(() => vi.advanceTimersByTime(300));
    await flushAsync();

    expect(screen.getByText("Couldn't load publications")).toBeInTheDocument();
    expect(screen.getByText("Simulated 500 failure")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flushAsync();

    expect(
      screen.getByRole("button", { name: "Journal of Artificial Intelligence Research" }),
    ).toBeInTheDocument();
  });
});

describe("PublicationDetailModal (Layer C details view)", () => {
  it("opens modal, formats XXXX-XXXX ISSNs, locks scroll, traps focus, and restores focus on Escape", async () => {
    fetchPublication.mockResolvedValueOnce(
      makePub({ issn: "10769757", eissn: "2041172x", issnCdrom: "2088-776X" }),
    );
    render(<PublicationsExplorer initialPage={makePage([PUB_JAIR])} />);

    const trigger = screen.getByRole("button", {
      name: "Journal of Artificial Intelligence Research",
    });
    trigger.focus();
    fireEvent.click(trigger);

    expect(document.body.style.overflow).toBe("hidden");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Loading publication details…",
    );

    await flushAsync();

    expect(fetchPublication).toHaveBeenCalledWith(1, expect.any(AbortSignal));
    expect(
      within(dialog).getByRole("heading", {
        name: "Journal of Artificial Intelligence Research",
      }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("JAIR")).toBeInTheDocument();
    expect(within(dialog).getByText("1076-9757")).toBeInTheDocument();
    expect(within(dialog).getByText("2041-172X")).toBeInTheDocument();
    expect(within(dialog).getByText("2088-776X")).toBeInTheDocument();
    expect(within(dialog).getByText("1993")).toBeInTheDocument();
    expect(within(dialog).getByText("Artificial Intelligence")).toBeInTheDocument();
    expect(within(dialog).getByText("AI Access Foundation")).toBeInTheDocument();
    expect(within(dialog).getByText("Core Gold")).toBeInTheDocument();
    expect(within(dialog).getByText("Foundational and applied AI research")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: /Visit Journal Website/i }),
    ).toHaveAttribute("href", "https://jair.org");

    // Escape closes modal, unlocks scroll, and returns focus to the trigger button
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(trigger).toHaveFocus();
  });

  it("omits missing optional fields cleanly and never renders unsafe URLs as links", async () => {
    fetchPublication.mockResolvedValueOnce({
      ...PUB_MINIMAL,
      URL: "ftp://legacy-archive.example.org/journal",
    });
    render(<PublicationsExplorer initialPage={makePage([PUB_MINIMAL])} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Mock Minimalist Publication Without Optional Metadata",
      }),
    );
    await flushAsync();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("ISSN")).toBeNull();
    expect(within(dialog).queryByText("eISSN")).toBeNull();
    expect(within(dialog).queryByText("CD-ROM ISSN")).toBeNull();
    expect(within(dialog).queryByText("Launch Year")).toBeNull();
    expect(within(dialog).queryByText("License")).toBeNull();
    expect(within(dialog).queryByText("Imprint")).toBeNull();
    expect(within(dialog).queryByText("Specific Focus Scope")).toBeNull();
    expect(within(dialog).queryByText("Journal Scope")).toBeNull();
    expect(within(dialog).queryByRole("link", { name: /Visit Journal Website/i })).toBeNull();
    expect(dialog.textContent).not.toMatch(/N\/A|undefined|null/);
  });

  it("shows not-found state when publication was deleted (404) without flashing before load", async () => {
    let rejectReq!: (err: Error) => void;
    fetchPublication.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectReq = reject;
      }),
    );
    render(<PublicationsExplorer initialPage={makePage([PUB_JAIR])} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Journal of Artificial Intelligence Research" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("status")).toBeInTheDocument();
    expect(within(dialog).queryByText("Publication not found")).toBeNull();

    await act(async () => {
      rejectReq(new ApiError(404, "Publication not found"));
      await Promise.resolve();
    });

    expect(
      within(dialog).getByRole("heading", { name: "Publication not found" }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows error state with working retry on non-404 errors", async () => {
    fetchPublication
      .mockRejectedValueOnce(new ApiError(500, "Database timeout"))
      .mockResolvedValueOnce(PUB_JAIR);

    render(<PublicationsExplorer initialPage={makePage([PUB_JAIR])} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Journal of Artificial Intelligence Research" }),
    );
    await flushAsync();

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Publication unavailable" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Database timeout")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    await flushAsync();

    expect(
      within(dialog).getByRole("heading", {
        name: "Journal of Artificial Intelligence Research",
      }),
    ).toBeInTheDocument();
    expect(fetchPublication).toHaveBeenCalledTimes(2);
  });
});
