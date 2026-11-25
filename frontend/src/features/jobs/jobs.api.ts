import axios from "axios";
import { ApiError, api, type ApiResponse } from "@/src/lib/api-client";
import { safeExternalUrl } from "@/src/components/catalog/CatalogDetails";
import { PAGE_SIZE, PRIORITY_DISCIPLINES } from "./jobs.constants";
import type {
  Job,
  JobFacets,
  JobFilters,
  JobType,
  JobsApiErrorKind,
  JobsResponse,
  Seniority,
} from "./jobs.type";
import { jobDomains, normalizeCountryName } from "./jobs.utils";

export class JobsApiError extends Error {
  readonly status: number;
  readonly kind: JobsApiErrorKind;

  constructor(status: number, message: string, kind: JobsApiErrorKind) {
    super(message);
    this.name = "JobsApiError";
    this.status = status;
    this.kind = kind;
  }
}

export function classifyApiError(cause: unknown): JobsApiError {
  if (cause instanceof JobsApiError) return cause;
  if (cause instanceof ApiError) {
    if (cause.status === 404) {
      return new JobsApiError(404, cause.message, "not_found");
    }
    if (cause.status === 400 || cause.status === 422) {
      return new JobsApiError(cause.status, cause.message, "validation");
    }
    if (cause.status === 429) {
      return new JobsApiError(429, cause.message, "rate_limited");
    }
    if (cause.status === 0) {
      return new JobsApiError(0, cause.message, "network");
    }
    if (cause.status >= 500) {
      return new JobsApiError(cause.status, cause.message, "server");
    }
    return new JobsApiError(cause.status, cause.message, "unknown");
  }
  const message =
    cause instanceof Error && cause.message
      ? cause.message
      : "Something went wrong loading data.";
  return new JobsApiError(0, message, "unknown");
}

const VALID_JOB_TYPES = new Set<JobType>(["fullTime", "partTime", "internship"]);
const VALID_SENIORITIES = new Set<Seniority>(["junior", "mid", "senior", "lead"]);

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeJob(raw: unknown): Job {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const rawCompany = (
    obj.company && typeof obj.company === "object" ? obj.company : {}
  ) as Record<string, unknown>;
  const rawBranch = (
    obj.branch && typeof obj.branch === "object" ? obj.branch : {}
  ) as Record<string, unknown>;

  const rawType = cleanString(obj.type);
  const rawSeniority = cleanString(obj.seniority);
  const visitedRaw = obj.numberVisited ?? obj.number_visited;
  const visited =
    typeof visitedRaw === "number" && Number.isFinite(visitedRaw) && visitedRaw >= 0
      ? Math.floor(visitedRaw)
      : 0;

  return {
    id: typeof obj.id === "number" ? obj.id : Number(obj.id) || 0,
    title: cleanString(obj.title) ?? "Untitled position",
    industry: cleanString(obj.industry),
    domains: jobDomains(obj.domains ?? obj.tags_json),
    type:
      rawType && VALID_JOB_TYPES.has(rawType as JobType)
        ? (rawType as JobType)
        : null,
    seniority:
      rawSeniority && VALID_SENIORITIES.has(rawSeniority as Seniority)
        ? (rawSeniority as Seniority)
        : null,
    source: cleanString(obj.source),
    isRemote: Boolean(obj.isRemote ?? obj.is_remote),
    location: cleanString(obj.location),
    description: cleanString(obj.description),
    requirements: cleanString(obj.requirements),
    salary: cleanString(obj.salary),
    applyLink: safeExternalUrl(cleanString(obj.applyLink ?? obj.url)),
    postedAt: cleanString(obj.postedAt ?? obj.first_seen_at),
    numberVisited: visited,
    company: {
      id:
        typeof rawCompany.id === "number"
          ? rawCompany.id
          : Number(rawCompany.id) || 0,
      name: cleanString(rawCompany.name) ?? "Unknown Company",
      shortName: cleanString(rawCompany.shortName),
      website: safeExternalUrl(cleanString(rawCompany.website)),
      headquartersCountry: normalizeCountryName(
        cleanString(rawCompany.headquartersCountry),
      ),
    },
    branch: {
      id:
        typeof rawBranch.id === "number"
          ? rawBranch.id
          : Number(rawBranch.id) || 0,
      city: cleanString(rawBranch.city),
      country: normalizeCountryName(cleanString(rawBranch.country)),
    },
  };
}

export function sortDisciplines(disciplines: string[]): string[] {
  return [...new Set(disciplines.map((d) => d.trim()).filter(Boolean))].sort(
    (a, b) => {
      const aIdx = PRIORITY_DISCIPLINES.indexOf(a.toLowerCase());
      const bIdx = PRIORITY_DISCIPLINES.indexOf(b.toLowerCase());
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    },
  );
}

export function buildJobsQuery(filters: JobFilters): string {
  const params = new URLSearchParams({
    page: String(Math.max(1, filters.page)),
    limit: String(PAGE_SIZE),
    sortBy: filters.sort === "title" ? "title" : "postedAt",
    sortOrder: filters.sort === "newest" ? "desc" : "asc",
  });
  for (const key of ["search", "source", "type", "seniority"] as const) {
    const value = filters[key].trim();
    if (value) params.set(key, value);
  }
  for (const key of ["countries", "disciplines", "companyIds"] as const) {
    for (const value of filters[key]) {
      const str = String(value).trim();
      if (str) params.append(key, str);
    }
  }
  return params.toString();
}

export async function fetchJobs(
  query: string,
  signal?: AbortSignal,
): Promise<JobsResponse> {
  try {
    const { data } = await api.get<JobsResponse>("/jobs", {
      params: new URLSearchParams(query),
      signal,
    });
    const list = Array.isArray(data?.data) ? data.data.map(normalizeJob) : [];
    const total = data?.pagination?.total ?? list.length;
    const page = data?.pagination?.page ?? 1;
    const limit = data?.pagination?.limit ?? PAGE_SIZE;
    const totalPages =
      data?.pagination?.totalPages ?? (total === 0 ? 0 : Math.ceil(total / limit));
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

export async function fetchJobFacets(signal?: AbortSignal): Promise<JobFacets> {
  try {
    const { data } = await api.get<ApiResponse<Partial<JobFacets>>>(
      "/jobs/filters",
      { signal },
    );
    const payload = data?.data ?? {};
    const countries = Array.isArray(payload.countries)
      ? [
          ...new Set(
            payload.countries
              .filter((c): c is string => typeof c === "string" && !!c.trim())
              .map((c) => normalizeCountryName(c))
              .filter((c): c is string => Boolean(c)),
          ),
        ]
      : [];
    const rawCounts =
      payload.countryCounts && typeof payload.countryCounts === "object"
        ? payload.countryCounts
        : {};
    const countryCounts: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawCounts)) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
        const canonical = normalizeCountryName(k);
        if (canonical) {
          countryCounts[canonical] = (countryCounts[canonical] ?? 0) + v;
        }
      }
    }
    const disciplines = Array.isArray(payload.disciplines)
      ? sortDisciplines(
          payload.disciplines.filter((d): d is string => typeof d === "string"),
        )
      : [];
    const companies = Array.isArray(payload.companies)
      ? payload.companies
          .filter(
            (c): c is { id: number; name: string; featured?: boolean } =>
              Boolean(c) &&
              typeof c.id === "number" &&
              typeof c.name === "string" &&
              !!c.name.trim(),
          )
          .map((c) => ({
            id: c.id,
            name: c.name.trim(),
            featured: Boolean(c.featured),
          }))
      : [];
    const sources = Array.isArray(payload.sources)
      ? payload.sources.filter((s): s is string => typeof s === "string" && !!s.trim())
      : ["linkedin", "wuzzuf"];

    return { countries, countryCounts, disciplines, companies, sources };
  } catch (cause) {
    if (axios.isCancel(cause)) throw cause;
    throw classifyApiError(cause);
  }
}

export async function fetchJobById(
  id: number | string,
  signal?: AbortSignal,
): Promise<Job> {
  try {
    const { data } = await api.get<ApiResponse<unknown>>(
      `/jobs/${encodeURIComponent(String(id))}`,
      { signal },
    );
    return normalizeJob(data?.data);
  } catch (cause) {
    if (axios.isCancel(cause)) throw cause;
    throw classifyApiError(cause);
  }
}

/** Increments visit count for a job; returns authoritative count or null on error. */
export async function recordJobVisit(
  id: number | string,
  signal?: AbortSignal,
): Promise<number | null> {
  try {
    const { data } = await api.post<{
      number_visited?: number;
      numberVisited?: number;
    }>("/jobs/visit", { id }, { signal });
    const count = data?.numberVisited ?? data?.number_visited;
    return typeof count === "number" && Number.isFinite(count) ? count : null;
  } catch {
    // Visit tracking failure must stay silent per parity & verification contract
    return null;
  }
}
