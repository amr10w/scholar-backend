import axios from "axios";
import { api, type ApiResponse } from "@/src/lib/api-client";
import { safeExternalUrl } from "@/src/components/catalog/CatalogDetails";
import { COMPANIES_PAGE_SIZE } from "./jobs.constants";
import { classifyApiError, normalizeJob } from "./jobs.api";
import type {
  CompaniesResponse,
  CompanyDetail,
  CompanyFacets,
  CompanyFilters,
  CompanyMonthlyStat,
  CompanySummary,
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
        .map((v) => v.trim())
        .filter(Boolean),
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
    headquartersCountry: cleanString(obj.headquartersCountry ?? obj.hq),
    globalPresence,
    website: safeExternalUrl(cleanString(obj.website)),
    linkedin: safeExternalUrl(cleanString(obj.linkedin)),
    note: cleanString(obj.note),
    featured: Boolean(obj.featured),
    openJobsCount,
  };
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
  const monthlyStats: CompanyMonthlyStat[] = Array.isArray(obj.monthlyStats)
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
    throw classifyApiError(cause);
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
