import { ApiError, api, type ApiResponse, type Paginated } from "@/src/lib/api-client";
import type {
  CreatePublicationInput,
  LicenseType,
  Publication,
  PublicationAccessType,
  PublicationEditorialStat,
  PublicationErrorKind,
  PublicationFacets,
  PublicationFilters,
  PublicationPricing,
  PublicationQuery,
  PublicationSubCategory,
  PublicationType,
  PublicationYearlyMetric,
  Publisher,
  SubBucket,
  UpdatePublicationInput,
  Workflow,
} from "./publication.type";

/**
 * Raw API row returned by `/api/publications` and `/api/publications/:id`.
 * The backend misspells `launchYear` as `yearLunched`; normalized here so both
 * `launchYear` and `yearLunched` are available on `Publication`.
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
  subBucket?: SubBucket | string | null;
  createdAt?: string;
  updatedAt?: string;
  subCategory?: PublicationSubCategory | null;
  yearlyMetrics?: PublicationYearlyMetric[];
  pricings?: PublicationPricing[];
  editorialStats?: PublicationEditorialStat[];
}

export function countPublicationFilters(filters: PublicationFilters) {
  return Object.values(filters).filter((values) => values.length > 0).length;
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

export function normalizePublication(
  raw: ApiPublicationRow | null | undefined,
): Publication {
  const rawYear = raw?.yearLunched ?? raw?.launchYear;
  const launchYear =
    typeof rawYear === "number" && Number.isFinite(rawYear) ? rawYear : null;

  const subCat = raw?.subCategory;
  const subCategory: PublicationSubCategory | null =
    subCat && typeof subCat === "object" && typeof subCat.name === "string"
      ? {
          id: typeof subCat.id === "number" ? subCat.id : Number(subCat.id) || 0,
          domainId:
            typeof subCat.domainId === "number"
              ? subCat.domainId
              : Number(subCat.domainId) || 0,
          name: subCat.name,
          ...(subCat.domain ? { domain: subCat.domain } : {}),
        }
      : null;

  return {
    id: typeof raw?.id === "number" ? raw.id : Number(raw?.id) || 0,
    subCategoryId:
      typeof raw?.subCategoryId === "number"
        ? raw.subCategoryId
        : Number(raw?.subCategoryId) || 0,
    acronym: typeof raw?.acronym === "string" ? raw.acronym : null,
    publisher: (typeof raw?.publisher === "string"
      ? raw.publisher
      : "IEEE") as Publisher,
    publicationType: (typeof raw?.publicationType === "string"
      ? raw.publicationType
      : "Journal") as PublicationType,
    title: typeof raw?.title === "string" ? raw.title : "",
    issn: typeof raw?.issn === "string" ? raw.issn : null,
    eissn: typeof raw?.eissn === "string" ? raw.eissn : null,
    issnCdrom: typeof raw?.issnCdrom === "string" ? raw.issnCdrom : null,
    URL: typeof raw?.URL === "string" ? raw.URL : null,
    yearLunched: launchYear,
    launchYear,
    openAccessType: (typeof raw?.openAccessType === "string"
      ? raw.openAccessType
      : "Hybrid") as PublicationAccessType,
    specificFocusScope:
      typeof raw?.specificFocusScope === "string"
        ? raw.specificFocusScope
        : null,
    workflow: (typeof raw?.workflow === "string"
      ? raw.workflow
      : "standard") as Workflow,
    licenseType: (typeof raw?.licenseType === "string"
      ? raw.licenseType
      : null) as LicenseType | null,
    journalScope:
      typeof raw?.journalScope === "string" ? raw.journalScope : null,
    imprint: typeof raw?.imprint === "string" ? raw.imprint : null,
    subBucket: (typeof raw?.subBucket === "string"
      ? raw.subBucket
      : null) as SubBucket | string | null,
    createdAt: typeof raw?.createdAt === "string" ? raw.createdAt : "",
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : "",
    subCategory,
    ...(Array.isArray(raw?.yearlyMetrics)
      ? { yearlyMetrics: raw.yearlyMetrics }
      : {}),
    ...(Array.isArray(raw?.pricings) ? { pricings: raw.pricings } : {}),
    ...(Array.isArray(raw?.editorialStats)
      ? { editorialStats: raw.editorialStats }
      : {}),
  };
}

function toApiWritePayload(
  input: CreatePublicationInput | UpdatePublicationInput,
): Record<string, unknown> {
  const { launchYear, yearLunched, ...rest } = input;
  const payload: Record<string, unknown> = { ...rest };
  if (yearLunched !== undefined) {
    payload.yearLunched = yearLunched;
  } else if (launchYear !== undefined) {
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
  categoryIds,
  publicationTypes,
  accessModels,
  publishers,
  quartiles,
}: PublicationQuery = {}): Record<string, string | number | undefined> {
  const params: Record<string, string | number | undefined> = {
    search: search?.trim() || undefined,
    page,
    limit,
    categoryIds: categoryIds?.join(",") || undefined,
    publicationTypes: publicationTypes?.join(",") || undefined,
    accessModels: accessModels?.join(",") || undefined,
    publishers: publishers?.join(",") || undefined,
    quartiles: quartiles?.join(",") || undefined,
  };
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

  const rows = Array.isArray(data?.data)
    ? data.data.map(normalizePublication)
    : [];
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

export async function fetchPublicationFacets(
  signal?: AbortSignal,
): Promise<PublicationFacets> {
  const { data } = await api.get<ApiResponse<PublicationFacets>>(
    "/publications/filters",
    { signal },
  );
  return data.data;
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
