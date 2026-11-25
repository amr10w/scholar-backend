import { StrictMode, useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

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
  usePathname: () => "/jobs",
  useSearchParams: () =>
    new URLSearchParams(
      useSyncExternalStore(urlStore.subscribe, urlStore.snapshot),
    ),
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockLeafletMap({
      selectedCountries,
      onToggleCountry,
    }: {
      selectedCountries: string[];
      onToggleCountry: (c: string) => void;
    }) {
      return (
        <div data-testid="mock-leaflet-map">
          <button type="button" onClick={() => onToggleCountry("Egypt")}>
            Map toggle Egypt ({selectedCountries.includes("Egypt") ? "on" : "off"})
          </button>
        </div>
      );
    },
}));

const {
  fetchJobs,
  fetchJobFacets,
  recordJobVisit,
  fetchCompanies,
  fetchCompanyFacets,
  fetchCompanyById,
} = vi.hoisted(() => ({
  fetchJobs: vi.fn(),
  fetchJobFacets: vi.fn(),
  recordJobVisit: vi.fn(),
  fetchCompanies: vi.fn(),
  fetchCompanyFacets: vi.fn(),
  fetchCompanyById: vi.fn(),
}));

vi.mock("../jobs.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../jobs.api")>();
  return {
    ...actual,
    fetchJobs,
    fetchJobFacets,
    recordJobVisit,
  };
});

vi.mock("../companies.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../companies.api")>();
  return {
    ...actual,
    fetchCompanies,
    fetchCompanyFacets,
    fetchCompanyById,
  };
});

import type { CompanyDetail, CompanySummary, Job } from "../jobs.type";
import JobsHubClient from "./JobsHubClient";

const JOB_1: Job = {
  id: 1,
  title: "Senior Physical Design Engineer (RTL2GDS)",
  industry: "Physical Design",
  domains: ["VLSI", "Physical Design"],
  type: "fullTime",
  seniority: "senior",
  source: "linkedin",
  isRemote: false,
  location: "Cairo, Egypt",
  description: "RTL2GDS tapeout role.",
  requirements: null,
  salary: "Competitive",
  applyLink: "https://www.linkedin.com/jobs/view/mock-job-1",
  postedAt: "2026-11-25T09:00:00.000Z",
  numberVisited: 13,
  company: {
    id: 1,
    name: "STMicroelectronics (ST)",
    shortName: "ST",
    website: "https://www.st.com",
    headquartersCountry: "Egypt",
  },
  branch: { id: 10, city: "Cairo", country: "Egypt" },
};

const JOB_NO_LINK: Job = {
  ...JOB_1,
  id: 57,
  title: "Mock Unsafe Link Opening",
  applyLink: null,
  numberVisited: 0,
};

const COMP_1: CompanySummary = {
  id: 1,
  slug: "stmicroelectronics",
  name: "STMicroelectronics (ST)",
  shortName: "ST",
  industry: "Multinational (Design & R&D)",
  size: "10,001+",
  description: "Semiconductor manufacturer.",
  headquartersCountry: "Egypt",
  globalPresence: ["Egypt", "France", "Italy", "Turkey"],
  website: "https://www.st.com",
  linkedin: "https://www.linkedin.com/company/stmicroelectronics",
  note: "Established Design Center.",
  featured: true,
  openJobsCount: 5,
};

const COMP_1_DETAIL: CompanyDetail = {
  ...COMP_1,
  jobs: [JOB_1],
  latestPositions: [JOB_1],
  monthlyStats: [
    { companyId: 1, yearMonth: "2026-10", jobCount: 1 },
    { companyId: 1, yearMonth: "2026-11", jobCount: 2 },
  ],
};

const originalPushState = window.history.pushState.bind(window.history);

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  originalPushState(null, "", "/jobs");
  urlStore.emit();
  vi.spyOn(window.history, "pushState").mockImplementation((d, u, url) => {
    originalPushState(d, u, url);
    urlStore.emit();
  });

  fetchJobs.mockReset().mockResolvedValue({
    success: true,
    data: [JOB_1, JOB_NO_LINK],
    pagination: { total: 2, page: 1, limit: 12, totalPages: 1 },
  });
  fetchJobFacets.mockReset().mockResolvedValue({
    countries: ["Egypt", "Germany"],
    countryCounts: { Egypt: 28, Germany: 7 },
    disciplines: ["AI", "Physical Design"],
    companies: [
      { id: 1, name: "STMicroelectronics (ST)", featured: true },
      { id: 19, name: "Other Lab", featured: false },
    ],
    sources: ["linkedin", "wuzzuf"],
  });
  recordJobVisit.mockReset().mockResolvedValue(14);

  fetchCompanies.mockReset().mockResolvedValue({
    success: true,
    data: [COMP_1],
    pagination: { total: 1, page: 1, limit: 24, totalPages: 1 },
  });
  fetchCompanyFacets.mockReset().mockResolvedValue({
    countries: ["Egypt", "Germany"],
    countryCounts: { Egypt: 19, Germany: 4 },
    categories: ["Multinational (Design & R&D)"],
    sizes: ["10,001+"],
  });
  fetchCompanyById.mockReset().mockResolvedValue(COMP_1_DETAIL);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("JobsHubClient (Career Map + Companies + Map + Modals)", () => {
  it("renders Career Map, opens JobDetailModal, increments visit count once under StrictMode, and resets all filters", async () => {
    render(
      <StrictMode>
        <JobsHubClient />
      </StrictMode>,
    );
    await flushAsync();

    expect(screen.getByText("Career Explorer")).toBeInTheDocument();
    expect(screen.getByText("2 Openings")).toBeInTheDocument();
    expect(screen.getByText("13 visited")).toBeInTheDocument();

    // Open job modal -> increments visit count once and shows Apply on LinkedIn
    fireEvent.click(
      screen.getByRole("button", { name: /Senior Physical Design Engineer/i }),
    );
    await flushAsync();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("14 visited")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: /Apply on LinkedIn/i }),
    ).toHaveAttribute("href", "https://www.linkedin.com/jobs/view/mock-job-1");
    expect(recordJobVisit).toHaveBeenCalledTimes(1);

    // Close via Cancel
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    // Opening job without safe link disables CTA
    fireEvent.click(
      screen.getByRole("button", { name: /Mock Unsafe Link Opening/i }),
    );
    await flushAsync();
    expect(
      screen.getByRole("button", { name: "Application link unavailable" }),
    ).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    // Map picker confirm + brand search + reset clears everything
    fireEvent.click(screen.getByRole("button", { name: /Select Countries/i }));
    const mapDialog = screen.getByRole("dialog");
    fireEvent.click(within(mapDialog).getByRole("checkbox", { name: /Egypt/i }));
    fireEvent.click(within(mapDialog).getByRole("button", { name: /Confirm/i }));
    expect(
      screen.getByRole("button", { name: "Select Countries (1)" }),
    ).toBeInTheDocument();

    const brandInput = screen.getByRole("searchbox", { name: "Search brands" });
    fireEvent.change(brandInput, { target: { value: "ST" } });
    expect(brandInput).toHaveValue("ST");

    fireEvent.click(screen.getByRole("button", { name: "Reset all filters" }));
    expect(
      screen.getByRole("button", { name: "Select Countries (0)" }),
    ).toBeInTheDocument();
    expect(brandInput).toHaveValue("");
  });

  it("switches to Companies tab, opens CompanyDetailModal with chart & links, and isolates facets errors", async () => {
    fetchCompanyFacets.mockRejectedValueOnce(new Error("Facets down"));

    render(<JobsHubClient />);
    await flushAsync();

    fireEvent.click(screen.getByRole("button", { name: "Companies" }));
    await flushAsync();

    expect(window.location.search).toContain("tab=companies");
    expect(screen.getByText("Global Companies")).toBeInTheDocument();
    // Facets error banner is shown, yet company cards still render cleanly
    expect(
      screen.getByText("Couldn't load company filter options."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /STMicroelectronics \(ST\)/i }),
    ).toBeInTheDocument();

    // Open Company modal
    fireEvent.click(
      screen.getByRole("button", { name: /STMicroelectronics \(ST\)/i }),
    );
    await flushAsync();

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Hiring Timeline (Opened Positions)"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Latest Positions")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Website/i })).toHaveAttribute(
      "href",
      "https://www.st.com/",
    );
    expect(within(dialog).getByRole("link", { name: /LinkedIn/i })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/company/stmicroelectronics",
    );
  });
});
