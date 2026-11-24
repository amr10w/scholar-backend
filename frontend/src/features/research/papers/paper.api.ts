import axios from "axios";
import { safeExternalUrl } from "@/src/components/catalog/CatalogDetails";
import {
  ApiError,
  api,
  type ApiResponse,
  type Paginated,
} from "@/src/lib/api-client";
import type { YearRange } from "../researchYears.api";

export const PAPERS_DEFAULT_LIMIT = 10;
export const PAPERS_PAGE_SIZE = 12;
export const PAPERS_MAX_LIMIT = 50;

export const ALLOWED_PAPER_SORT_FIELDS = [
  "publicationYear",
  "createdAt",
  "title",
  "journalTitle",
] as const;

export type PaperSortField = (typeof ALLOWED_PAPER_SORT_FIELDS)[number];
export type PaperSortOrder = "asc" | "desc";

export type PaperErrorKind =
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "network"
  | "server"
  | "unknown";

export interface ResearchPaper {
  id: number;
  title: string;
  subtitle: string | null;
  journalTitle: string | null;
  publicationYear: number | null;
  sourceName: string | null;
  type: string | null;
  doi: string | null;
  url: string | null;
  publicationMonth: number | null;
  publicationDay: number | null;
  orcidPath: string | null;
  putCode: string | null;
  visibility?: string | null;
  staffId?: number;
  staff: { id: number; name: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaperQuery {
  search?: string;
  year?: number;
  yearRange?: YearRange;
  page?: number;
  limit?: number;
  sortBy?: PaperSortField;
  /** Backend papers controller uses `order` (not `sortOrder`) for sort direction. */
  order?: PaperSortOrder;
}

export interface CreatePaperInput {
  title: string;
  staffId: number;
  putCode?: string | number | null;
  orcidPath?: string | null;
  subtitle?: string | null;
  type?: string | null;
  journalTitle?: string | null;
  doi?: string | null;
  url?: string | null;
  publicationYear?: number | null;
  publicationMonth?: number | null;
  publicationDay?: number | null;
  sourceName?: string | null;
  visibility?: string | null;
}

export type UpdatePaperInput = Partial<CreatePaperInput>;

export class PaperApiError extends ApiError {
  constructor(
    status: number,
    message: string,
    readonly kind: PaperErrorKind,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(status, message);
    this.name = "PaperApiError";
  }
}

const SORT_FIELD_SET = new Set<string>(ALLOWED_PAPER_SORT_FIELDS);
const DOI_IDENTIFIER_PATTERN = /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;

function classifyStatus(status: number): PaperErrorKind {
  if (status === 404) return "not_found";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "validation";
  if (status === 0) return "network";
  if (status >= 500) return "server";
  return "unknown";
}

export function extractPaperFieldErrors(
  message: string,
  rawErrors?: Record<string, unknown> | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (rawErrors && typeof rawErrors === "object") {
    for (const [key, val] of Object.entries(rawErrors)) {
      if (typeof val === "string" && val.trim()) {
        out[key] = val.trim();
      } else if (Array.isArray(val) && typeof val[0] === "string") {
        out[key] = val[0];
      }
    }
  }
  const lower = message.toLowerCase();
  if (!out.title && lower.includes("title")) out.title = message;
  if (
    !out.staffId &&
    (lower.includes("staffid") || lower.includes("staff member"))
  ) {
    out.staffId = message;
  }
  if (!out.publicationYear && lower.includes("year")) {
    out.publicationYear = message;
  }
  if (!out.publicationMonth && lower.includes("publicationmonth")) {
    out.publicationMonth = message;
  }
  if (!out.publicationDay && lower.includes("publicationday")) {
    out.publicationDay = message;
  }
  if (!out.putCode && lower.includes("putcode")) {
    out.putCode = message;
  }
  return out;
}

export function getPaperErrorKind(cause: unknown): PaperErrorKind {
  if (cause instanceof PaperApiError) return cause.kind;
  if (cause instanceof ApiError) return classifyStatus(cause.status);
  return "unknown";
}

export function isPaperNotFound(cause: unknown): boolean {
  return getPaperErrorKind(cause) === "not_found";
}

export function isPaperUnauthorized(cause: unknown): boolean {
  return getPaperErrorKind(cause) === "unauthorized";
}

export function isPaperForbidden(cause: unknown): boolean {
  return getPaperErrorKind(cause) === "forbidden";
}

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullablePositiveInt(
  value: unknown,
  min = 1,
  max = 9999,
): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= min && value <= max ? value : null;
}

export function normalizePaper(
  raw: Partial<ResearchPaper> | Record<string, unknown> | null | undefined,
): ResearchPaper {
  const row = (raw ?? {}) as Record<string, unknown>;
  const rawStaff = row.staff as
    | { id?: unknown; name?: unknown }
    | null
    | undefined;
  const staff =
    rawStaff &&
    typeof rawStaff === "object" &&
    typeof rawStaff.name === "string" &&
    rawStaff.name.trim()
      ? {
          id:
            typeof rawStaff.id === "number"
              ? rawStaff.id
              : Number(rawStaff.id) || 0,
          name: rawStaff.name.trim(),
        }
      : null;

  const rawPutCode = row.putCode;
  const putCode =
    typeof rawPutCode === "string" && rawPutCode.trim()
      ? rawPutCode.trim()
      : typeof rawPutCode === "number" && Number.isFinite(rawPutCode)
        ? String(Math.trunc(rawPutCode))
        : null;

  return {
    id: typeof row.id === "number" ? row.id : Number(row.id) || 0,
    title: typeof row.title === "string" ? row.title.trim() : "",
    subtitle: nullableString(row.subtitle),
    journalTitle: nullableString(row.journalTitle),
    publicationYear: nullablePositiveInt(row.publicationYear, 1, 9999),
    publicationMonth: nullablePositiveInt(row.publicationMonth, 1, 12),
    publicationDay: nullablePositiveInt(row.publicationDay, 1, 31),
    sourceName: nullableString(row.sourceName),
    type: nullableString(row.type),
    doi: nullableString(row.doi),
    url: nullableString(row.url),
    orcidPath: nullableString(row.orcidPath),
    putCode,
    visibility: nullableString(row.visibility),
    ...(typeof row.staffId === "number" ? { staffId: row.staffId } : {}),
    staff,
    ...(typeof row.createdAt === "string" ? { createdAt: row.createdAt } : {}),
    ...(typeof row.updatedAt === "string" ? { updatedAt: row.updatedAt } : {}),
  };
}

/**
 * Resolves a safe `http(s)` link for a paper: prefers `paper.url` when safe,
 * otherwise derives `https://doi.org/...` when `paper.doi` is a valid DOI or http(s) URL.
 */
export function resolvePaperExternalUrl(
  paper: Pick<ResearchPaper, "url" | "doi"> | null | undefined,
): string | null {
  if (!paper) return null;
  const direct = safeExternalUrl(paper.url);
  if (direct) return direct;

  const rawDoi = paper.doi?.trim();
  if (!rawDoi) return null;

  const asUrl = safeExternalUrl(rawDoi);
  if (asUrl) return asUrl;

  const stripped = rawDoi.replace(/^doi:\s*/i, "").trim();
  if (DOI_IDENTIFIER_PATTERN.test(stripped)) {
    return `https://doi.org/${encodeURI(stripped)}`;
  }
  return null;
}

/**
 * Builds validated query params for `GET /api/papers`:
 * - Clamps `limit` to `1..50` (the backend's real cap)
 * - Uses `order` (not `sortOrder`) and allows only the 4 backend sort fields
 * - Never sends `year` and `fromYear`/`toYear` together
 */
export function buildPaperParams({
  search,
  year,
  yearRange,
  page = 1,
  limit = PAPERS_PAGE_SIZE,
  sortBy,
  order,
}: PaperQuery = {}): Record<string, string | number> {
  const safePage =
    typeof page === "number" && Number.isFinite(page) && page >= 1
      ? Math.trunc(page)
      : 1;
  const rawLimit =
    typeof limit === "number" && Number.isFinite(limit) && limit >= 1
      ? Math.trunc(limit)
      : PAPERS_DEFAULT_LIMIT;
  const safeLimit = Math.min(PAPERS_MAX_LIMIT, Math.max(1, rawLimit));

  const params: Record<string, string | number> = {
    page: safePage,
    limit: safeLimit,
  };

  const trimmedSearch = search?.trim();
  if (trimmedSearch) {
    params.search = trimmedSearch;
  }

  if (yearRange) {
    const fromY = Math.min(yearRange.fromYear, yearRange.toYear);
    const toY = Math.max(yearRange.fromYear, yearRange.toYear);
    if (Number.isInteger(fromY) && fromY >= 1 && fromY <= 9999) {
      params.fromYear = fromY;
    }
    if (Number.isInteger(toY) && toY >= 1 && toY <= 9999) {
      params.toYear = toY;
    }
  } else if (
    typeof year === "number" &&
    Number.isInteger(year) &&
    year >= 1 &&
    year <= 9999
  ) {
    params.year = year;
  }

  if (sortBy && SORT_FIELD_SET.has(sortBy)) {
    params.sortBy = sortBy;
    if (order === "asc" || order === "desc") {
      params.order = order;
    }
  } else if (order === "asc" || order === "desc") {
    params.sortBy = "publicationYear";
    params.order = order;
  }

  return params;
}

function toPaperApiError(
  status: number,
  body: unknown,
): PaperApiError {
  const obj =
    body && typeof body === "object"
      ? (body as {
          message?: unknown;
          error?: unknown;
          errors?: Record<string, unknown>;
          fieldErrors?: Record<string, unknown>;
        })
      : undefined;
  const message =
    (typeof obj?.message === "string" && obj.message.trim()) ||
    (typeof obj?.error === "string" && obj.error.trim()) ||
    `Request failed with status ${status}`;
  const kind = classifyStatus(status);
  const fieldErrors =
    kind === "validation"
      ? extractPaperFieldErrors(message, obj?.fieldErrors ?? obj?.errors ?? null)
      : {};
  return new PaperApiError(status, message, kind, fieldErrors);
}

function rethrowNormalized(cause: unknown): never {
  if (axios.isCancel(cause) || cause instanceof PaperApiError) {
    throw cause;
  }
  if (cause instanceof ApiError) {
    const kind = classifyStatus(cause.status);
    const fieldErrors =
      kind === "validation" ? extractPaperFieldErrors(cause.message) : {};
    throw new PaperApiError(cause.status, cause.message, kind, fieldErrors);
  }
  throw new PaperApiError(
    0,
    cause instanceof Error && cause.message
      ? cause.message
      : "Something went wrong. Please try again.",
    "unknown",
  );
}

export async function fetchPapers(
  query: PaperQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<ResearchPaper>> {
  const params = buildPaperParams(query);
  try {
    const response = await api.get<Paginated<ResearchPaper>>("/papers", {
      params,
      signal,
      validateStatus: () => true,
    });
    if (response.status >= 400) {
      throw toPaperApiError(response.status, response.data);
    }
    const payload = response.data;
    const rows = Array.isArray(payload?.data)
      ? payload.data.map((item) => normalizePaper(item))
      : [];
    const limit = payload?.pagination?.limit ?? Number(params.limit);
    const total = payload?.pagination?.total ?? rows.length;
    const page = payload?.pagination?.page ?? Number(params.page);
    const totalPages =
      payload?.pagination?.totalPages ??
      (limit > 0 ? Math.ceil(total / limit) : 0);

    return {
      success: Boolean(payload?.success ?? true),
      message: payload?.message,
      data: rows,
      pagination: { total, page, limit, totalPages },
    };
  } catch (cause) {
    rethrowNormalized(cause);
  }
}

export async function fetchPaper(
  id: number | string,
  signal?: AbortSignal,
): Promise<ResearchPaper> {
  const encodedId = encodeURIComponent(String(id));
  try {
    const response = await api.get<ApiResponse<ResearchPaper>>(
      `/papers/${encodedId}`,
      {
        signal,
        validateStatus: () => true,
      },
    );
    if (response.status >= 400) {
      throw toPaperApiError(response.status, response.data);
    }
    return normalizePaper(response.data?.data);
  } catch (cause) {
    rethrowNormalized(cause);
  }
}

function toWritePayload(
  input: CreatePaperInput | UpdatePaperInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...input };
  if (typeof payload.putCode === "number" && Number.isFinite(payload.putCode)) {
    payload.putCode = String(Math.trunc(payload.putCode));
  }
  return payload;
}

/** Creates a research paper (requires authenticated session cookie). */
export async function createPaper(
  input: CreatePaperInput,
  signal?: AbortSignal,
): Promise<ResearchPaper> {
  try {
    const response = await api.post<ApiResponse<ResearchPaper>>(
      "/papers",
      toWritePayload(input),
      {
        signal,
        validateStatus: () => true,
      },
    );
    if (response.status >= 400) {
      throw toPaperApiError(response.status, response.data);
    }
    return normalizePaper(response.data?.data);
  } catch (cause) {
    rethrowNormalized(cause);
  }
}

/** Partially updates a research paper (requires authenticated session cookie). */
export async function updatePaper(
  id: number | string,
  input: UpdatePaperInput,
  signal?: AbortSignal,
): Promise<ResearchPaper> {
  const encodedId = encodeURIComponent(String(id));
  try {
    const response = await api.patch<ApiResponse<ResearchPaper>>(
      `/papers/${encodedId}`,
      toWritePayload(input),
      {
        signal,
        validateStatus: () => true,
      },
    );
    if (response.status >= 400) {
      throw toPaperApiError(response.status, response.data);
    }
    return normalizePaper(response.data?.data);
  } catch (cause) {
    rethrowNormalized(cause);
  }
}

/** Deletes a research paper (requires authenticated session cookie; body-agnostic). */
export async function deletePaper(
  id: number | string,
  signal?: AbortSignal,
): Promise<void> {
  const encodedId = encodeURIComponent(String(id));
  try {
    const response = await api.delete(`/papers/${encodedId}`, {
      signal,
      validateStatus: () => true,
    });
    if (response.status >= 400) {
      throw toPaperApiError(response.status, response.data);
    }
  } catch (cause) {
    rethrowNormalized(cause);
  }
}
