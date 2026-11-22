import { ApiError, api, type ApiResponse, type Paginated } from "@/src/lib/api-client";
import type {
  AcademicResearcher,
  CreateResearcherInput,
  ResearcherErrorKind,
  ResearcherFacets,
  ResearcherQuery,
  ScholarAnalysisResponse,
  ScholarProfile,
  ScholarSearchResponse,
  UpdateResearcherInput,
} from "./researcher.type";
import {
  buildResearcherFacets,
  cleanName,
  fullName,
  toScholarProfile,
} from "./researcher.utils";

export const RESEARCHERS_PAGE_SIZE = 12;
// The API caps `limit` at 100; facets come from up to 100 researchers
const FACET_SAMPLE_SIZE = 100;

export function getResearcherErrorKind(cause: unknown): ResearcherErrorKind {
  if (cause instanceof ApiError) {
    if (cause.status === 401) return "unauthorized";
    if (cause.status === 404) return "not_found";
    if (cause.status === 400 || cause.status === 422) return "validation";
    if (cause.status === 0) return "network";
    if (cause.status >= 500) return "server";
  }
  return "unknown";
}

export function isUnauthorizedError(cause: unknown): boolean {
  return getResearcherErrorKind(cause) === "unauthorized";
}

export function isNotFoundError(cause: unknown): boolean {
  return getResearcherErrorKind(cause) === "not_found";
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Builds clean query params for GET /api/researchers, omitting empty values. */
export function buildResearcherParams({
  page = 1,
  limit = RESEARCHERS_PAGE_SIZE,
  sortBy,
  sortOrder,
  researcher,
  mainTopic,
  institutionName,
  department,
}: ResearcherQuery = {}): Record<string, string | number> {
  const params: Record<string, string | number> = { page, limit };
  if (sortBy) params.sortBy = sortBy;
  if (sortOrder) params.sortOrder = sortOrder;

  const trimmedResearcher = nonEmpty(researcher);
  const trimmedTopic = nonEmpty(mainTopic);
  const trimmedInstitution = nonEmpty(institutionName);
  const trimmedDepartment = nonEmpty(department);

  if (trimmedResearcher) params.researcher = trimmedResearcher;
  if (trimmedTopic) params.mainTopic = trimmedTopic;
  if (trimmedInstitution) params.institutionName = trimmedInstitution;
  if (trimmedDepartment) params.department = trimmedDepartment;

  return params;
}

function normalizeResearcher(raw: Partial<AcademicResearcher> | null | undefined): AcademicResearcher {
  return {
    id: typeof raw?.id === "number" ? raw.id : Number(raw?.id) || 0,
    firstName: typeof raw?.firstName === "string" ? raw.firstName : "",
    lastName: typeof raw?.lastName === "string" ? raw.lastName : "",
    institutionName: typeof raw?.institutionName === "string" ? raw.institutionName : null,
    department: typeof raw?.department === "string" ? raw.department : null,
    affiliation: typeof raw?.affiliation === "string" ? raw.affiliation : null,
    mainTopic: typeof raw?.mainTopic === "string" ? raw.mainTopic : null,
    subtopics: raw?.subtopics ?? null,
    scholarId: typeof raw?.scholarId === "string" ? raw.scholarId : null,
    linkedinUrl: typeof raw?.linkedinUrl === "string" ? raw.linkedinUrl : null,
    createdAt: typeof raw?.createdAt === "string" ? raw.createdAt : "",
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : "",
  };
}

export async function fetchResearchers(
  query: ResearcherQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<AcademicResearcher>> {
  const params = buildResearcherParams(query);
  const { data } = await api.get<Paginated<AcademicResearcher>>("/researchers", {
    params,
    signal,
  });

  const rows = Array.isArray(data?.data) ? data.data.map(normalizeResearcher) : [];
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

export async function fetchResearcherFacets(signal?: AbortSignal): Promise<ResearcherFacets> {
  const page = await fetchResearchers({ page: 1, limit: FACET_SAMPLE_SIZE }, signal);
  return buildResearcherFacets(page.data);
}

export async function fetchResearcher(
  id: number | string,
  signal?: AbortSignal,
): Promise<AcademicResearcher> {
  const encodedId = encodeURIComponent(String(id));
  const { data } = await api.get<ApiResponse<AcademicResearcher>>(
    `/researchers/${encodedId}`,
    { signal },
  );
  return normalizeResearcher(data?.data);
}

/** Creates a researcher record (requires authenticated session cookie). */
export async function createResearcher(
  input: CreateResearcherInput,
  signal?: AbortSignal,
): Promise<AcademicResearcher> {
  const { data } = await api.post<ApiResponse<AcademicResearcher>>("/researchers", input, {
    signal,
  });
  return normalizeResearcher(data?.data);
}

/** Partially updates a researcher record (requires authenticated session cookie). */
export async function updateResearcher(
  id: number | string,
  input: UpdateResearcherInput,
  signal?: AbortSignal,
): Promise<AcademicResearcher> {
  const encodedId = encodeURIComponent(String(id));
  const { data } = await api.patch<ApiResponse<AcademicResearcher>>(
    `/researchers/${encodedId}`,
    input,
    { signal },
  );
  return normalizeResearcher(data?.data);
}

/** Deletes a researcher record (requires authenticated session cookie; body-agnostic). */
export async function deleteResearcher(
  id: number | string,
  signal?: AbortSignal,
): Promise<void> {
  const encodedId = encodeURIComponent(String(id));
  await api.delete(`/researchers/${encodedId}`, { signal });
}

/**
 * Same lookup the legacy researchers service used: a numeric scholarId is already a
 * Semantic Scholar author id; anything else means "search S2 by name, take the top hit".
 */
export async function resolveScholarAuthorId(
  researcher: AcademicResearcher,
  signal?: AbortSignal,
): Promise<string | null> {
  const storedId = researcher.scholarId?.trim() ?? "";
  if (/^\d+$/.test(storedId)) return storedId;

  const query = cleanName(fullName(researcher));
  if (!query) return null;

  const { data } = await api.get<ScholarSearchResponse>("/search", {
    params: { query, limit: 1 },
    signal,
  });
  return data.authors?.[0]?.authorId ?? null;
}

/** Papers, metrics and co-authors from Semantic Scholar, or null when no author matches. */
export async function fetchScholarProfile(
  researcher: AcademicResearcher,
  signal?: AbortSignal,
): Promise<ScholarProfile | null> {
  const authorId = await resolveScholarAuthorId(researcher, signal);
  if (!authorId) return null;

  const { data } = await api.post<ScholarAnalysisResponse>(
    "/analyze",
    { authorId },
    { signal },
  );
  return toScholarProfile(data.author, data.collaborators);
}
