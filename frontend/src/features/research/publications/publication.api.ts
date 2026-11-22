import { ApiError, api, type ApiResponse, type Paginated } from "@/src/lib/api-client";
import type {
  CreatePublicationInput,
  LicenseType,
  NumericRange,
  Publication,
  PublicationAccessType,
  PublicationEditorialStat,
  PublicationErrorKind,
  PublicationFilterRanges,
  PublicationFilterState,
  PublicationPricing,
  PublicationQuery,
  PublicationSubCategory,
  PublicationType,
  PublicationYearlyMetric,
  Publisher,
  RangeValue,
  SubBucket,
  UpdatePublicationInput,
  Workflow,
} from "./publication.type";

/**
 * Raw API row returned by `/api/publications` and `/api/publications/:id`.
 * The backend misspells `launchYear` as `yearLunched`; kept strictly inside this boundary.
 */
interface ApiPublicationRow {
  id?: number;
  subCategoryId?: number;
  acronym?: string | null;
  publisher?: Publisher;
  publicationType?: PublicationType;
  title?: string;
  issn?: string | null;
  eissn?: string | null;
  issnCdrom?: string | null;
  URL?: string | null;
  yearLunched?: number | null;
  launchYear?: number | null;
  openAccessType?: PublicationAccessType;
  specificFocusScope?: string | null;
  workflow?: Workflow;
  licenseType?: LicenseType | null;
  journalScope?: string | null;
  imprint?: string | null;
  subBucket?: SubBucket | null;
  createdAt?: string;
  updatedAt?: string;
  subCategory?: PublicationSubCategory | null;
  yearlyMetrics?: PublicationYearlyMetric[];
  pricings?: PublicationPricing[];
  editorialStats?: PublicationEditorialStat[];
}

export function getPublicationErrorKind(cause: unknown): PublicationErrorKind {
  if (cause instanceof ApiError) {
    if (cause.status === 404) return "not_found";
    if (cause.status === 401) return "unauthorized";
    if (cause.status === 403) return "forbidden";
    if (cause.status === 409) return "conflict";
    if (cause.status === 400 || cause.status === 422) return "validation";
    if (cause.status === 0) return "network";
    if (cause.status >= 500) return "server";
  }
  return "unknown";
}

export function isPublicationNotFound(cause: unknown): boolean {
  return getPublicationErrorKind(cause) === "not_found";
}

export function isPublicationUnauthorized(cause: unknown): boolean {
  return getPublicationErrorKind(cause) === "unauthorized";
}

export function isPublicationForbidden(cause: unknown): boolean {
  return getPublicationErrorKind(cause) === "forbidden";
}

export function isPublicationConflict(cause: unknown): boolean {
  return getPublicationErrorKind(cause) === "conflict";
}

export function normalizePublication(raw: ApiPublicationRow | null | undefined): Publication {
  const rawYear = raw?.yearLunched ?? raw?.launchYear;
  const launchYear =
    typeof rawYear === "number" && Number.isFinite(rawYear) ? rawYear : null;

  const subCat = raw?.subCategory;
  const subCategory: PublicationSubCategory | null =
    subCat && typeof subCat === "object" && typeof subCat.name === "string"
      ? {
          id: typeof subCat.id === "number" ? subCat.id : Number(subCat.id) || 0,
          domainId:
            typeof subCat.domainId === "number" ? subCat.domainId : Number(subCat.domainId) || 0,
          name: subCat.name,
          ...(subCat.domain ? { domain: subCat.domain } : {}),
        }
      : null;

  return {
    id: typeof raw?.id === "number" ? raw.id : Number(raw?.id) || 0,
    subCategoryId:
      typeof raw?.subCategoryId === "number" ? raw.subCategoryId : Number(raw?.subCategoryId) || 0,
    acronym: typeof raw?.acronym === "string" ? raw.acronym : null,
    publisher: (typeof raw?.publisher === "string" ? raw.publisher : "IEEE") as Publisher,
    publicationType: (
      typeof raw?.publicationType === "string" ? raw.publicationType : "Journal"
    ) as PublicationType,
    title: typeof raw?.title === "string" ? raw.title : "",
    issn: typeof raw?.issn === "string" ? raw.issn : null,
    eissn: typeof raw?.eissn === "string" ? raw.eissn : null,
    issnCdrom: typeof raw?.issnCdrom === "string" ? raw.issnCdrom : null,
    URL: typeof raw?.URL === "string" ? raw.URL : null,
    launchYear,
    openAccessType: (
      typeof raw?.openAccessType === "string" ? raw.openAccessType : "Hybrid"
    ) as PublicationAccessType,
    specificFocusScope:
      typeof raw?.specificFocusScope === "string" ? raw.specificFocusScope : null,
    workflow: (typeof raw?.workflow === "string" ? raw.workflow : "standard") as Workflow,
    licenseType: (typeof raw?.licenseType === "string" ? raw.licenseType : null) as LicenseType | null,
    journalScope: typeof raw?.journalScope === "string" ? raw.journalScope : null,
    imprint: typeof raw?.imprint === "string" ? raw.imprint : null,
    subBucket: (typeof raw?.subBucket === "string" ? raw.subBucket : null) as SubBucket | null,
    createdAt: typeof raw?.createdAt === "string" ? raw.createdAt : "",
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : "",
    subCategory,
    ...(Array.isArray(raw?.yearlyMetrics) ? { yearlyMetrics: raw.yearlyMetrics } : {}),
    ...(Array.isArray(raw?.pricings) ? { pricings: raw.pricings } : {}),
    ...(Array.isArray(raw?.editorialStats) ? { editorialStats: raw.editorialStats } : {}),
  };
}

function toApiWritePayload(
  input: CreatePublicationInput | UpdatePublicationInput,
): Record<string, unknown> {
  const { launchYear, ...rest } = input;
  const payload: Record<string, unknown> = { ...rest };
  if (launchYear !== undefined) {
    payload.yearLunched = launchYear;
  }
  return payload;
}

export const PUBLICATIONS_PAGE_SIZE = 10;

export function buildPublicationParams({
  search,
  page = 1,
  limit = PUBLICATIONS_PAGE_SIZE,
  sortBy,
  sortOrder,
}: PublicationQuery = {}): Record<string, string | number> {
  const params: Record<string, string | number> = { page, limit };
  const trimmedSearch = search?.trim();
  if (trimmedSearch) params.search = trimmedSearch;
  if (sortBy) params.sortBy = sortBy;
  if (sortOrder) params.sortOrder = sortOrder;
  return params;
}

export async function fetchPublications(
  query: PublicationQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<Publication>> {
  const params = buildPublicationParams(query);
  const { data } = await api.get<Paginated<ApiPublicationRow>>("/publications", {
    params,
    signal,
  });

  const rows = Array.isArray(data?.data) ? data.data.map(normalizePublication) : [];
  const limit = data?.pagination?.limit ?? Number(params.limit);
  const total = data?.pagination?.total ?? rows.length;
  const page = data?.pagination?.page ?? Number(params.page);
  const totalPages =
    data?.pagination?.totalPages ?? (limit > 0 ? Math.ceil(total / limit) : 0);

  return {
    success: Boolean(data?.success ?? true),
    message: data?.message,
    data: rows,
    pagination: { total, page, limit, totalPages },
  };
}

export async function fetchPublication(
  id: number | string,
  signal?: AbortSignal,
): Promise<Publication> {
  const encodedId = encodeURIComponent(String(id));
  const { data } = await api.get<ApiResponse<ApiPublicationRow>>(
    `/publications/${encodedId}`,
    { signal },
  );
  return normalizePublication(data?.data);
}

export async function createPublication(
  input: CreatePublicationInput,
  signal?: AbortSignal,
): Promise<Publication> {
  const { data } = await api.post<ApiResponse<ApiPublicationRow>>(
    "/publications",
    toApiWritePayload(input),
    { signal },
  );
  return normalizePublication(data?.data);
}

export async function updatePublication(
  id: number | string,
  input: UpdatePublicationInput,
  signal?: AbortSignal,
): Promise<Publication> {
  const encodedId = encodeURIComponent(String(id));
  const { data } = await api.patch<ApiResponse<ApiPublicationRow>>(
    `/publications/${encodedId}`,
    toApiWritePayload(input),
    { signal },
  );
  return normalizePublication(data?.data);
}

export async function deletePublication(
  id: number | string,
  signal?: AbortSignal,
): Promise<void> {
  const encodedId = encodeURIComponent(String(id));
  await api.delete(`/publications/${encodedId}`, { signal });
}

/* ---- Legacy filter range helpers kept for PublicationFilterBar ---- */

export function isRangeActive(
  value: RangeValue,
  bound?: NumericRange,
): boolean {
  if (value.min === undefined && value.max === undefined) return false;
  if (!bound) return true;

  const narrowsMin = value.min !== undefined && value.min > bound.min;
  const narrowsMax = value.max !== undefined && value.max < bound.max;
  return narrowsMin || narrowsMax;
}

function activeRange(
  value: RangeValue,
  bound?: NumericRange,
): RangeValue | undefined {
  return isRangeActive(value, bound) ? value : undefined;
}

function appendRange(
  params: URLSearchParams,
  prefix: string,
  value: RangeValue | undefined,
): void {
  if (!value) return;
  if (value.min !== undefined) params.set(`${prefix}Min`, String(value.min));
  if (value.max !== undefined) params.set(`${prefix}Max`, String(value.max));
}

export function buildSearchParams(
  filters: PublicationFilterState,
  ranges?: PublicationFilterRanges,
): URLSearchParams {
  const params = new URLSearchParams();

  const query = filters.search.trim();
  if (query) params.set("q", query);

  if (filters.categoryIds.length) {
    params.set("categoryIds", filters.categoryIds.join(","));
  }

  if (filters.publishingModel.length) {
    params.set("publishingModel", filters.publishingModel.join(","));
  }

  if (filters.licensing.length) {
    params.set("licensing", filters.licensing.join(","));
  }

  if (filters.quartiles.length) {
    params.set("quartiles", filters.quartiles.join(","));
  }

  if (filters.maxCost !== undefined) {
    params.set("currency", filters.currency);
    params.set("maxCost", String(filters.maxCost));
  }

  appendRange(
    params,
    "impactFactor",
    activeRange(filters.impactFactor, ranges?.impactFactor),
  );
  appendRange(params, "sjr", activeRange(filters.sjr, ranges?.sjr));
  appendRange(
    params,
    "citeScore",
    activeRange(filters.citeScore, ranges?.citeScore),
  );
  appendRange(
    params,
    "firstDecisionWeeks",
    activeRange(filters.firstDecisionWeeks, ranges?.firstDecisionWeeks),
  );
  appendRange(
    params,
    "submissionToAcceptanceWeeks",
    activeRange(
      filters.submissionToAcceptanceWeeks,
      ranges?.submissionToAcceptanceWeeks,
    ),
  );

  return params;
}
