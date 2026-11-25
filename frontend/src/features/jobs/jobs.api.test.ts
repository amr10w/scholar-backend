import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

const { get, post } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/src/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/api-client")>();
  return {
    ...actual,
    api: { get, post },
  };
});

import { ApiError } from "@/src/lib/api-client";
import {
  JobsApiError,
  buildJobsQuery,
  classifyApiError,
  fetchJobById,
  fetchJobFacets,
  fetchJobs,
  normalizeJob,
  recordJobVisit,
} from "./jobs.api";
import {
  buildCompaniesQuery,
  fetchCompanies,
  fetchCompanyById,
  fetchCompanyFacets,
  normalizeCompanyDetail,
} from "./companies.api";
import { EMPTY_COMPANY_FILTERS, EMPTY_FILTERS } from "./jobs.constants";
import {
  applyCtaLabel,
  companyInitials,
  normalizeCountryName,
  postedDate,
} from "./jobs.utils";

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("jobs & companies data layer", () => {
  it("builds encoded jobs & companies queries omitting empty values", () => {
    const jq = buildJobsQuery({
      ...EMPTY_FILTERS,
      search: "  RTL & VLSI  ",
      source: "linkedin",
      type: "fullTime",
      seniority: "senior",
      countries: ["Egypt", "United Arab Emirates"],
      disciplines: ["Physical Design"],
      companyIds: [1, 4],
      sort: "title",
      page: 2,
    });
    const params = new URLSearchParams(jq);
    expect(params.get("search")).toBe("RTL & VLSI");
    expect(params.get("source")).toBe("linkedin");
    expect(params.get("type")).toBe("fullTime");
    expect(params.get("seniority")).toBe("senior");
    expect(params.getAll("countries")).toEqual(["Egypt", "United Arab Emirates"]);
    expect(params.getAll("disciplines")).toEqual(["Physical Design"]);
    expect(params.getAll("companyIds")).toEqual(["1", "4"]);
    expect(params.get("sortBy")).toBe("title");
    expect(params.get("sortOrder")).toBe("asc");
    expect(params.get("page")).toBe("2");

    const cq = buildCompaniesQuery({
      ...EMPTY_COMPANY_FILTERS,
      search: "  Siemens  ",
      category: "Multinational (Design & R&D)",
      size: "10,001+",
      countries: ["Egypt", "Germany"],
    });
    const cParams = new URLSearchParams(cq);
    expect(cParams.get("search")).toBe("Siemens");
    expect(cParams.get("industry")).toBe("Multinational (Design & R&D)");
    expect(cParams.get("size")).toBe("10,001+");
    expect(cParams.getAll("countries")).toEqual(["Egypt", "Germany"]);
  });

  it("defensively normalizes jobs & companies and strips unsafe URLs", () => {
    const minimal = normalizeJob({});
    expect(minimal.title).toBe("Untitled position");
    expect(minimal.applyLink).toBeNull();
    expect(minimal.numberVisited).toBe(0);
    expect(minimal.company.name).toBe("Unknown Company");

    const unsafe = normalizeJob({
      id: 57,
      title: "Unsafe Link Role",
      applyLink: "javascript:alert(1)",
      number_visited: 42,
      company: { id: 1, name: "ST", website: "ftp://bad.example" },
    });
    expect(unsafe.applyLink).toBeNull();
    expect(unsafe.company.website).toBeNull();
    expect(unsafe.numberVisited).toBe(42);

    expect(applyCtaLabel("https://www.linkedin.com/jobs/view/1")).toBe("Apply on LinkedIn");
    expect(applyCtaLabel("https://wuzzuf.net/jobs/p/1")).toBe("Apply on Wuzzuf");
    expect(applyCtaLabel("https://wa.me/201000000000")).toBe("Apply on WhatsApp");
    expect(applyCtaLabel("javascript:alert(1)")).toBe("Apply Now");
    expect(postedDate("2026-11-25T09:00:00.000Z")).toBe("Nov 25, 2026");
    expect(postedDate(null)).toBeNull();

    const comp = normalizeCompanyDetail({
      id: 20,
      name: "Unsafe Corp",
      website: "javascript:alert(1)",
      linkedin: "https://www.linkedin.com/company/safe",
      globalPresence: ["EG", "Egypt", "FR", "DE"],
      monthlyStats: [{ year_month: "2026-11", job_count: 3 }],
    });
    expect(comp.website).toBeNull();
    expect(comp.linkedin).toBe("https://www.linkedin.com/company/safe");
    expect(comp.globalPresence).toEqual(["Egypt", "France", "Germany"]);
    expect(comp.monthlyStats).toEqual([{ companyId: 20, yearMonth: "2026-11", jobCount: 3 }]);

    // Country normalization & company initials without punctuation
    expect(normalizeCountryName("EG")).toBe("Egypt");
    expect(normalizeCountryName("FR")).toBe("France");
    expect(normalizeCountryName("US")).toBe("United States");
    expect(companyInitials("STMicroelectronics (ST)")).toBe("ST");

    // Derives 12-month hiring timeline from jobs[].postedAt when monthlyStats is absent
    const compDerived = normalizeCompanyDetail({
      id: 1,
      name: "STMicroelectronics (ST)",
      branches: [{ country: "EG" }, { country: "FR" }],
      jobs: [
        { id: 10, title: "Job 1", postedAt: "2026-09-29T00:00:00.000Z" },
        { id: 11, title: "Job 2", postedAt: "2026-09-15T00:00:00.000Z" },
      ],
    });
    expect(compDerived.globalPresence).toEqual(["Egypt", "France"]);
    expect(compDerived.monthlyStats).toHaveLength(12);
    expect(
      compDerived.monthlyStats.find((m) => m.yearMonth === "2026-09")?.jobCount,
    ).toBe(2);
  });

  it("classifies every API error kind and swallows recordJobVisit errors silently", async () => {
    expect(classifyApiError(new ApiError(404, "Not found"))).toMatchObject({
      kind: "not_found",
      status: 404,
    } satisfies Partial<JobsApiError>);
    expect(classifyApiError(new ApiError(400, "Bad input")).kind).toBe("validation");
    expect(classifyApiError(new ApiError(429, "Slow down")).kind).toBe("rate_limited");
    expect(classifyApiError(new ApiError(0, "Offline")).kind).toBe("network");
    expect(classifyApiError(new ApiError(503, "Down")).kind).toBe("server");

    post.mockResolvedValueOnce({ data: { number_visited: 14 } });
    expect(await recordJobVisit(1)).toBe(14);

    post.mockRejectedValueOnce(new ApiError(500, "Visit failed"));
    expect(await recordJobVisit(1)).toBeNull();
  });

  it("rethrows axios cancel errors untouched and parses facet/detail responses", async () => {
    const cancel = new axios.CanceledError("aborted");
    get.mockRejectedValueOnce(cancel);
    await expect(fetchJobs("page=1")).rejects.toBe(cancel);

    get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          countries: ["Egypt"],
          countryCounts: { Egypt: 28 },
          disciplines: ["Software Engineering", "AI", "Digital"],
          companies: [{ id: 1, name: "ST", featured: true }],
          sources: ["linkedin", "wuzzuf"],
        },
      },
    });
    const facets = await fetchJobFacets();
    expect(facets.disciplines.slice(0, 2)).toEqual(["AI", "Digital"]);
    expect(facets.countryCounts.Egypt).toBe(28);

    get.mockResolvedValueOnce({ data: { success: true, data: { id: 1, title: "RTL" } } });
    expect((await fetchJobById(1)).title).toBe("RTL");

    get.mockResolvedValueOnce({
      data: { success: true, data: [{ id: 1, name: "ST" }], pagination: { total: 1, page: 1, limit: 24, totalPages: 1 } },
    });
    expect((await fetchCompanies("page=1")).data).toHaveLength(1);

    get.mockResolvedValueOnce({
      data: { success: true, data: { countries: ["Egypt"], countryCounts: { Egypt: 19 }, categories: ["Software"], sizes: ["10,001+"] } },
    });
    expect((await fetchCompanyFacets()).countryCounts.Egypt).toBe(19);

    // Fallback when /companies/filters is missing on the real backend (hits /:id with 400)
    get
      .mockRejectedValueOnce(new ApiError(400, "Invalid company ID provided"))
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: [
            { id: 1, name: "ST", industry: "Semiconductors", size: "10,001+", headquartersCountry: "Egypt" },
            { id: 2, name: "Siemens EDA", industry: "EDA", size: "5,001-10,000", headquartersCountry: "Egypt" },
          ],
          pagination: { total: 2, page: 1, limit: 100, totalPages: 1 },
        },
      });
    const derived = await fetchCompanyFacets();
    expect(derived.countryCounts).toEqual({ Egypt: 2 });
    expect(derived.categories).toEqual(["EDA", "Semiconductors"]);
    expect(derived.sizes).toEqual(["10,001+", "5,001-10,000"]);

    get.mockResolvedValueOnce({ data: { success: true, data: { id: 1, name: "ST", jobs: [] } } });
    expect((await fetchCompanyById(1)).name).toBe("ST");
  });
});
