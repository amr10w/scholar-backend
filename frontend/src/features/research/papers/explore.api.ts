import axios from "axios";
import { safeExternalUrl } from "@/src/components/catalog/CatalogDetails";
import { ApiError, api } from "@/src/lib/api-client";

export const EXPLORE_DEFAULT_LIMIT = 10;
export const EXPLORE_MAX_LIMIT = 50;
const MAX_EXPLORE_CACHE_ENTRIES = 30;
const EXPLORE_CACHE_TTL_MS = 5 * 60 * 1000;
const DOI_IDENTIFIER_PATTERN = /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;

export type ExploreMode = "search" | "recommend";

export type ExploreErrorKind =
  | "rate_limited"
  | "validation"
  | "not_found"
  | "network"
  | "server"
  | "unknown";

export interface ExploreAuthor {
  authorId: string | null;
  name: string;
}

export interface ExplorePaper {
  paperId: string;
  title: string;
  abstract: string | null;
  venue: string | null;
  year: number | null;
  authors: ExploreAuthor[];
  citationCount: number | null;
  /** Safe http(s) primary external URL (Semantic Scholar page, Open-Access PDF, or https://doi.org/...). */
  url: string | null;
  /** Safe http(s) Open-Access PDF link when available and distinct. */
  openAccessPdfUrl: string | null;
  doi: string | null;
  corpusId: string | null;
}

export interface ExploreQuery {
  mode?: ExploreMode;
  query?: string;
  paperId?: string;
  year?: number | null;
  limit?: number;
  offset?: number;
  /** Set true to bypass the client-side cache (e.g. explicit retry). */
  bypassCache?: boolean;
}

export interface ExploreResult {
  total: number;
  papers: ExplorePaper[];
  message?: string;
  fromCache: boolean;
}

export class ExploreApiError extends ApiError {
  constructor(
    status: number,
    message: string,
    readonly kind: ExploreErrorKind,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(status, message);
    this.name = "ExploreApiError";
  }
}

interface RawExplorePaper {
  paperId?: unknown;
  title?: unknown;
  abstract?: unknown;
  venue?: unknown;
  year?: unknown;
  authors?: unknown;
  citationCount?: unknown;
  openAccessPdf?: { url?: unknown } | null;
  url?: unknown;
  externalIds?: { DOI?: unknown; CorpusId?: unknown } | null;
}

interface RawExploreResponse {
  success?: boolean;
  total?: number;
  papers?: RawExplorePaper[];
  message?: string;
  error?: string;
  retryAfterSeconds?: number;
}

interface CacheEntry {
  expiresAt: number;
  value: Omit<ExploreResult, "fromCache">;
}

const exploreCache = new Map<string, CacheEntry>();

export function clearExploreCache(): void {
  exploreCache.clear();
  similarPapersCache.clear();
  for (const entry of similarInFlight.values()) {
    if (entry.abortTimer) clearTimeout(entry.abortTimer);
    entry.controller.abort();
  }
  similarInFlight.clear();
}

export interface SimilarPaperTarget {
  id: number;
  title: string;
  doi?: string | null;
}

export interface SimilarPapersHandle {
  promise: Promise<ExploreResult>;
  cancel: () => void;
}

interface InFlightSimilarEntry {
  promise: Promise<ExploreResult>;
  controller: AbortController;
  subscribers: number;
  abortTimer: ReturnType<typeof setTimeout> | null;
}

const similarPapersCache = new Map<number, ExploreResult>();
const similarInFlight = new Map<number, InFlightSimilarEntry>();

export function canFindSimilarForPaper(
  paper: Pick<SimilarPaperTarget, "title"> | null | undefined,
): boolean {
  return Boolean(paper?.title?.trim());
}

export function getCachedSimilarPapers(
  paperId: number,
): ExploreResult | undefined {
  const hit = similarPapersCache.get(paperId);
  return hit ? { ...hit, fromCache: true } : undefined;
}

function isSamePaper(
  target: SimilarPaperTarget,
  candidate: ExplorePaper,
): boolean {
  const targetDoi = target.doi?.trim().replace(/^doi:\s*/i, "").toLowerCase();
  const candDoi = candidate.doi?.trim().toLowerCase();
  if (targetDoi && candDoi && targetDoi === candDoi) return true;
  const targetTitle = target.title.trim().toLowerCase();
  const candTitle = candidate.title.trim().toLowerCase();
  return Boolean(targetTitle && candTitle && targetTitle === candTitle);
}

/**
 * Fetches papers similar to a local ResearchPaper via `GET /api/explore` using its title.
 * - Deduplicates concurrent/StrictMode mounts into a single in-flight HTTP request.
 * - Caches successful results per local paper ID for the current session.
 * - Aborts the underlying HTTP request if all subscribers unmount (after a short StrictMode grace tick).
 */
export function requestSimilarPapers(
  paper: SimilarPaperTarget,
  options: { bypassCache?: boolean; limit?: number } = {},
): SimilarPapersHandle {
  const { bypassCache = false, limit = 6 } = options;

  if (!canFindSimilarForPaper(paper)) {
    return {
      promise: Promise.reject(
        new ExploreApiError(
          400,
          "This paper does not have a title to search for similar papers.",
          "validation",
        ),
      ),
      cancel: () => {},
    };
  }

  if (!bypassCache) {
    const cached = similarPapersCache.get(paper.id);
    if (cached) {
      return {
        promise: Promise.resolve({ ...cached, fromCache: true }),
        cancel: () => {},
      };
    }
  }

  let entry = similarInFlight.get(paper.id);
  if (!entry) {
    const controller = new AbortController();
    const requestLimit = Math.min(EXPLORE_MAX_LIMIT, Math.max(1, limit) + 1);
    const promise = explorePapers(
      {
        mode: "search",
        query: paper.title.trim(),
        limit: requestLimit,
        bypassCache,
      },
      controller.signal,
    )
      .then((res) => {
        const filtered = res.papers
          .filter((item) => !isSamePaper(paper, item))
          .slice(0, limit);
        const normalized: ExploreResult = {
          total: filtered.length === 0 ? 0 : Math.max(filtered.length, res.total),
          papers: filtered,
          ...(res.message ? { message: res.message } : {}),
          fromCache: res.fromCache,
        };
        similarPapersCache.set(paper.id, normalized);
        return normalized;
      })
      .finally(() => {
        if (similarInFlight.get(paper.id)?.promise === promise) {
          similarInFlight.delete(paper.id);
        }
      });

    entry = {
      promise,
      controller,
      subscribers: 0,
      abortTimer: null,
    };
    similarInFlight.set(paper.id, entry);
  }

  if (entry.abortTimer) {
    clearTimeout(entry.abortTimer);
    entry.abortTimer = null;
  }
  entry.subscribers += 1;

  let cancelled = false;
  const activeEntry = entry;
  return {
    promise: activeEntry.promise,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      activeEntry.subscribers = Math.max(0, activeEntry.subscribers - 1);
      if (activeEntry.subscribers === 0 && !activeEntry.abortTimer) {
        activeEntry.abortTimer = setTimeout(() => {
          activeEntry.abortTimer = null;
          if (activeEntry.subscribers === 0) {
            activeEntry.controller.abort();
            if (similarInFlight.get(paper.id) === activeEntry) {
              similarInFlight.delete(paper.id);
            }
          }
        }, 30);
      }
    },
  };
}

export function parseRetryAfterSeconds(
  headerValue: unknown,
  bodyRetryAfter?: unknown,
): number | null {
  if (
    typeof bodyRetryAfter === "number" &&
    Number.isFinite(bodyRetryAfter) &&
    bodyRetryAfter > 0
  ) {
    return Math.ceil(bodyRetryAfter);
  }
  if (typeof headerValue === "string" && headerValue.trim()) {
    const trimmed = headerValue.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      return parsed > 0 ? parsed : null;
    }
    const asDate = Date.parse(trimmed);
    if (Number.isFinite(asDate)) {
      const diffSec = Math.ceil((asDate - Date.now()) / 1000);
      return diffSec > 0 ? diffSec : 1;
    }
  }
  return null;
}

export function getExploreErrorKind(cause: unknown): ExploreErrorKind {
  if (cause instanceof ExploreApiError) return cause.kind;
  if (cause instanceof ApiError) {
    if (cause.status === 429) return "rate_limited";
    if (cause.status === 400 || cause.status === 422) return "validation";
    if (cause.status === 404) return "not_found";
    if (cause.status === 0) return "network";
    if (cause.status >= 500) return "server";
  }
  return "unknown";
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeExplorePaper(
  raw: RawExplorePaper | null | undefined,
  fallbackIndex = 0,
): ExplorePaper {
  const row = raw ?? {};
  const title = cleanText(row.title) ?? "Untitled paper";
  const paperId = cleanText(row.paperId) ?? `s2-item-${fallbackIndex}`;
  const abstract = cleanText(row.abstract);
  const venue = cleanText(row.venue);

  const year =
    typeof row.year === "number" &&
    Number.isInteger(row.year) &&
    row.year >= 1 &&
    row.year <= 9999
      ? row.year
      : null;

  const citationCount =
    typeof row.citationCount === "number" &&
    Number.isFinite(row.citationCount) &&
    row.citationCount >= 0
      ? Math.trunc(row.citationCount)
      : null;

  const authors: ExploreAuthor[] = [];
  if (Array.isArray(row.authors)) {
    for (const entry of row.authors) {
      if (typeof entry === "string") {
        const name = cleanText(entry);
        if (name) authors.push({ authorId: null, name });
      } else if (entry && typeof entry === "object") {
        const obj = entry as { authorId?: unknown; name?: unknown };
        const name = cleanText(obj.name);
        if (name) {
          authors.push({
            authorId: cleanText(obj.authorId),
            name,
          });
        }
      }
    }
  }

  const ext =
    row.externalIds && typeof row.externalIds === "object"
      ? row.externalIds
      : null;
  const rawDoi = cleanText(ext?.DOI);
  const doi = rawDoi ? rawDoi.replace(/^doi:\s*/i, "").trim() : null;
  const corpusId =
    typeof ext?.CorpusId === "number" && Number.isFinite(ext.CorpusId)
      ? String(Math.trunc(ext.CorpusId))
      : cleanText(ext?.CorpusId);

  const openAccessPdfUrl = safeExternalUrl(
    row.openAccessPdf && typeof row.openAccessPdf === "object"
      ? (row.openAccessPdf.url as string | null | undefined)
      : null,
  );
  const directUrl = safeExternalUrl(row.url as string | null | undefined);
  const doiFallbackUrl =
    doi && DOI_IDENTIFIER_PATTERN.test(doi)
      ? `https://doi.org/${encodeURI(doi)}`
      : null;

  const primaryUrl = directUrl ?? openAccessPdfUrl ?? doiFallbackUrl;

  return {
    paperId,
    title,
    abstract,
    venue,
    year,
    authors,
    citationCount,
    url: primaryUrl,
    openAccessPdfUrl:
      openAccessPdfUrl && openAccessPdfUrl !== primaryUrl
        ? openAccessPdfUrl
        : openAccessPdfUrl && directUrl
          ? openAccessPdfUrl
          : null,
    doi,
    corpusId,
  };
}

export function buildExploreParams({
  mode = "search",
  query,
  paperId,
  year,
  limit = EXPLORE_DEFAULT_LIMIT,
  offset = 0,
}: ExploreQuery): Record<string, string | number> {
  const safeLimit = Math.min(
    EXPLORE_MAX_LIMIT,
    Math.max(
      1,
      typeof limit === "number" && Number.isFinite(limit)
        ? Math.trunc(limit)
        : EXPLORE_DEFAULT_LIMIT,
    ),
  );
  const safeOffset =
    typeof offset === "number" && Number.isFinite(offset) && offset >= 0
      ? Math.trunc(offset)
      : 0;

  if (mode === "recommend") {
    const trimmedPaperId = paperId?.trim() ?? "";
    if (!trimmedPaperId) {
      throw new ExploreApiError(
        400,
        "Enter a Semantic Scholar paper ID or Corpus ID to get recommendations.",
        "validation",
      );
    }
    return {
      mode: "recommend",
      paperId: trimmedPaperId,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  const trimmedQuery = query?.trim() ?? "";
  if (!trimmedQuery) {
    throw new ExploreApiError(
      400,
      "Enter a research topic or keyword to search Semantic Scholar.",
      "validation",
    );
  }

  const params: Record<string, string | number> = {
    query: trimmedQuery,
    limit: safeLimit,
    offset: safeOffset,
  };

  if (
    typeof year === "number" &&
    Number.isInteger(year) &&
    year >= 1900 &&
    year <= 9999
  ) {
    params.year = year;
  }

  return params;
}

function makeCacheKey(params: Record<string, string | number>): string {
  const normalized = Object.entries(params)
    .map(([k, v]) => [
      k,
      k === "query" ? String(v).toLowerCase() : String(v),
    ])
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(normalized);
}

export async function explorePapers(
  input: ExploreQuery,
  signal?: AbortSignal,
): Promise<ExploreResult> {
  const params = buildExploreParams(input);
  const cacheKey = makeCacheKey(params);

  if (!input.bypassCache) {
    const hit = exploreCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      // Refresh LRU order
      exploreCache.delete(cacheKey);
      exploreCache.set(cacheKey, hit);
      return { ...hit.value, fromCache: true };
    }
    if (hit) {
      exploreCache.delete(cacheKey);
    }
  }

  try {
    const response = await api.get<RawExploreResponse>("/explore", {
      params,
      signal,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      const body =
        response.data && typeof response.data === "object"
          ? response.data
          : undefined;
      const retryAfter =
        response.status === 429
          ? parseRetryAfterSeconds(
              response.headers?.["retry-after"],
              body?.retryAfterSeconds,
            )
          : null;
      const kind: ExploreErrorKind =
        response.status === 429
          ? "rate_limited"
          : response.status === 400 || response.status === 422
            ? "validation"
            : response.status === 404
              ? "not_found"
              : response.status >= 500
                ? "server"
                : "unknown";
      const message =
        cleanText(body?.message) ??
        cleanText(body?.error) ??
        (response.status === 429
          ? "Semantic Scholar rate limit reached. Please wait a moment and try again."
          : `Request failed with status ${response.status}`);
      throw new ExploreApiError(response.status, message, kind, retryAfter);
    }

    const rawPapers = Array.isArray(response.data?.papers)
      ? response.data.papers
      : [];
    const papers = rawPapers.map((item, idx) =>
      normalizeExplorePaper(item, idx),
    );
    const total =
      typeof response.data?.total === "number" &&
      Number.isFinite(response.data.total) &&
      response.data.total >= 0
        ? Math.trunc(response.data.total)
        : papers.length;
    const message = cleanText(response.data?.message) ?? undefined;

    const stored: Omit<ExploreResult, "fromCache"> = {
      total,
      papers,
      ...(message ? { message } : {}),
    };

    if (exploreCache.size >= MAX_EXPLORE_CACHE_ENTRIES) {
      const oldestKey = exploreCache.keys().next().value;
      if (oldestKey !== undefined) exploreCache.delete(oldestKey);
    }
    exploreCache.set(cacheKey, {
      expiresAt: Date.now() + EXPLORE_CACHE_TTL_MS,
      value: stored,
    });

    return { ...stored, fromCache: false };
  } catch (cause) {
    if (axios.isCancel(cause) || cause instanceof ExploreApiError) {
      throw cause;
    }
    if (cause instanceof ApiError) {
      throw new ExploreApiError(
        cause.status,
        cause.message,
        getExploreErrorKind(cause),
      );
    }
    throw new ExploreApiError(
      0,
      cause instanceof Error && cause.message
        ? cause.message
        : "Could not reach Semantic Scholar discovery right now.",
      "unknown",
    );
  }
}
