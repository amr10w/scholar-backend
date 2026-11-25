import axios from "axios";
import { api, type ApiResponse } from "@/src/lib/api-client";
import { safeExternalUrl } from "@/src/components/catalog/CatalogDetails";
import { COMPANIES_PAGE_SIZE } from "./jobs.constants";
import { classifyApiError, normalizeJob } from "./jobs.api";
import { normalizeCountryName } from "./jobs.utils";
import type {
  CompaniesResponse,
  CompanyDetail,
  CompanyFacets,
  CompanyFilters,
  CompanyMonthlyStat,
  CompanySummary,
  Job,
} from "./jobs.type";

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeCompanySummary(raw: unknown): CompanySummary {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const presenceRaw = Array.isArray(obj.globalPresence)
    ? obj.globalPresence
    : Array.isArray(obj.branches)
      ? obj.branches.map((b) =>
          b && typeof b === "object"
            ? (b as Record<string, unknown>).country
            : null,
        )
      : [];
  const globalPresence = [
    ...new Set(
      presenceRaw
        .filter((v): v is string => typeof v === "string")
        .map((v) => normalizeCountryName(v))
        .filter((v): v is string => Boolean(v)),
    ),
  ];

  const openJobsCount =
    typeof obj.openJobsCount === "number" && Number.isFinite(obj.openJobsCount)
      ? Math.max(0, Math.floor(obj.openJobsCount))
      : Array.isArray(obj.jobs)
        ? obj.jobs.length
        : 0;

  return {
    id: typeof obj.id === "number" ? obj.id : Number(obj.id) || 0,
    slug: cleanString(obj.slug),
    name: cleanString(obj.name) ?? "Unknown Company",
    shortName: cleanString(obj.shortName),
    industry: cleanString(obj.industry),
    size: cleanString(obj.size),
    description: cleanString(obj.description),
    headquartersCountry: normalizeCountryName(
      cleanString(obj.headquartersCountry ?? obj.hq),
    ),
    globalPresence,
    website: safeExternalUrl(cleanString(obj.website)),
    linkedin: safeExternalUrl(cleanString(obj.linkedin)),
    note: cleanString(obj.note),
    featured: Boolean(obj.featured),
    openJobsCount,
  };
}

/** Derives a 12-month hiring timeline from job postedAt dates when backend monthlyStats is absent. */
function deriveMonthlyStatsFromJobs(
  companyId: number,
  jobs: Job[],
): CompanyMonthlyStat[] {
  const countsByMonth = new Map<string, number>();
  let latestTimestamp = 0;

  for (const job of jobs) {
    if (!job.postedAt) continue;
    const date = new Date(job.postedAt);
    if (Number.isNaN(date.getTime())) continue;
    const ts = date.getTime();
    if (ts > latestTimestamp) latestTimestamp = ts;
    const ym = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    countsByMonth.set(ym, (countsByMonth.get(ym) ?? 0) + 1);
  }

  if (countsByMonth.size === 0) return [];

  const now = new Date();
  const anchor =
    latestTimestamp > now.getTime() ? new Date(latestTimestamp) : now;
  const anchorYear = anchor.getUTCFullYear();
  const anchorMonth = anchor.getUTCMonth();

  const series: CompanyMonthlyStat[] = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const d = new Date(Date.UTC(anchorYear, anchorMonth - offset, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    series.push({
      companyId,
      yearMonth: ym,
      jobCount: countsByMonth.get(ym) ?? 0,
    });
  }

  // If all jobs are older than the 12-month window ending at `anchor`, anchor on the latest job instead
  const windowTotal = series.reduce((sum, item) => sum + item.jobCount, 0);
  if (windowTotal === 0 && latestTimestamp > 0) {
    const latest = new Date(latestTimestamp);
    const lYear = latest.getUTCFullYear();
    const lMonth = latest.getUTCMonth();
    return Array.from({ length: 12 }, (_, idx) => {
      const d = new Date(Date.UTC(lYear, lMonth - (11 - idx), 1));
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      return {
        companyId,
        yearMonth: ym,
        jobCount: countsByMonth.get(ym) ?? 0,
      };
    });
  }

  return series;
}

export function normalizeCompanyDetail(raw: unknown): CompanyDetail {
  const summary = normalizeCompanySummary(raw);
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const jobs = Array.isArray(obj.jobs) ? obj.jobs.map(normalizeJob) : [];
  const latestPositions = Array.isArray(obj.latestPositions)
    ? obj.latestPositions.map(normalizeJob)
    : jobs.slice(0, 5);
  const rawMonthlyStats: CompanyMonthlyStat[] = Array.isArray(obj.monthlyStats)
    ? obj.monthlyStats
        .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object"))
        .map((s) => ({
          companyId:
            typeof s.companyId === "number" ? s.companyId : summary.id,
          yearMonth: String(s.yearMonth ?? s.year_month ?? ""),
          jobCount:
            typeof s.jobCount === "number"
              ? s.jobCount
              : typeof s.job_count === "number"
                ? s.job_count
                : 0,
        }))
        .filter((s) => Boolean(s.yearMonth))
    : [];
  const monthlyStats =
    rawMonthlyStats.length > 0
      ? rawMonthlyStats
      : deriveMonthlyStatsFromJobs(summary.id, jobs);

  return {
    ...summary,
    openJobsCount: jobs.length || summary.openJobsCount,
    jobs,
    latestPositions,
    monthlyStats,
  };
}

export function buildCompaniesQuery(filters: CompanyFilters): string {
  const params = new URLSearchParams({
    page: String(Math.max(1, filters.page)),
    limit: String(COMPANIES_PAGE_SIZE),
  });
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.category.trim()) params.set("industry", filters.category.trim());
  if (filters.size.trim()) params.set("size", filters.size.trim());
  for (const country of filters.countries) {
    if (country.trim()) params.append("countries", country.trim());
  }
  if (filters.countries.length === 1 && filters.countries[0].trim()) {
    params.set("headquartersCountry", filters.countries[0].trim());
  }
  return params.toString();
}

export async function fetchCompanies(
  query: string,
  signal?: AbortSignal,
): Promise<CompaniesResponse> {
  try {
    const { data } = await api.get<CompaniesResponse>("/companies", {
      params: new URLSearchParams(query),
      signal,
    });
    const list = Array.isArray(data?.data)
      ? data.data.map(normalizeCompanySummary)
      : [];
    const total = data?.pagination?.total ?? list.length;
    const page = data?.pagination?.page ?? 1;
    const limit = data?.pagination?.limit ?? COMPANIES_PAGE_SIZE;
    const totalPages =
      data?.pagination?.totalPages ??
      (total === 0 ? 0 : Math.ceil(total / limit));
    return {
      success: Boolean(data?.success ?? true),
      data: list,
      pagination: { total, page, limit, totalPages },
    };
  } catch (cause) {
    if (axios.isCancel(cause)) throw cause;
    throw classifyApiError(cause);
  }
}

function deriveCompanyFacetsFromList(list: CompanySummary[]): CompanyFacets {
  const countryCounts: Record<string, number> = {};
  const categorySet = new Set<string>();
  const sizeSet = new Set<string>();

  for (const company of list) {
    if (company.industry) categorySet.add(company.industry);
    if (company.size) sizeSet.add(company.size);

    const locations = new Set<string>();
    if (company.headquartersCountry) locations.add(company.headquartersCountry);
    for (const country of company.globalPresence) {
      if (country) locations.add(country);
    }
    for (const country of locations) {
      countryCounts[country] = (countryCounts[country] ?? 0) + 1;
    }
  }

  return {
    countries: Object.keys(countryCounts).sort((a, b) => a.localeCompare(b)),
    countryCounts,
    categories: Array.from(categorySet).sort((a, b) => a.localeCompare(b)),
    sizes: Array.from(sizeSet).sort((a, b) => a.localeCompare(b)),
  };
}

export async function fetchCompanyFacets(
  signal?: AbortSignal,
): Promise<CompanyFacets> {
  try {
    const { data } = await api.get<ApiResponse<Partial<CompanyFacets>>>(
      "/companies/filters",
      { signal },
    );
    const payload = data?.data ?? {};
    const countries = Array.isArray(payload.countries)
      ? payload.countries.filter((c): c is string => typeof c === "string" && !!c.trim())
      : [];
    const rawCounts =
      payload.countryCounts && typeof payload.countryCounts === "object"
        ? payload.countryCounts
        : {};
    const countryCounts: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawCounts)) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
        countryCounts[k] = v;
      }
    }
    const categories = Array.isArray(payload.categories)
      ? payload.categories.filter((c): c is string => typeof c === "string" && !!c.trim())
      : [];
    const sizes = Array.isArray(payload.sizes)
      ? payload.sizes.filter((s): s is string => typeof s === "string" && !!s.trim())
      : [];
    return { countries, countryCounts, categories, sizes };
  } catch (cause) {
    if (axios.isCancel(cause)) throw cause;
    const classified = classifyApiError(cause);
    // The real backend currently has no GET /api/companies/filters route (it hits /:id with 400 or 404).
    // Gracefully derive filter options from the companies list instead of failing.
    if (classified.status === 400 || classified.status === 404) {
      try {
        const res = await fetchCompanies("page=1&limit=100", signal);
        return deriveCompanyFacetsFromList(res.data);
      } catch (fallbackCause) {
        if (axios.isCancel(fallbackCause)) throw fallbackCause;
        throw classifyApiError(fallbackCause);
      }
    }
    throw classified;
  }
}

export async function fetchCompanyById(
  id: number | string,
  signal?: AbortSignal,
): Promise<CompanyDetail> {
  try {
    const { data } = await api.get<ApiResponse<unknown>>(
      `/companies/${encodeURIComponent(String(id))}`,
      { signal },
    );
    return normalizeCompanyDetail(data?.data);
  } catch (cause) {
    if (axios.isCancel(cause)) throw cause;
    throw classifyApiError(cause);
  }
}
