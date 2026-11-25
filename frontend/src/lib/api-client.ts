import axios, { isAxiosError } from "axios";

// In the browser we call same-origin `/api`, which next.config.ts rewrites to the
// backend — so cookies (better-auth session) work and there is no CORS.
// On the server (Server Components) there is no origin, so we call the backend directly.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:5000";

export const API_BASE_URL =
  typeof window === "undefined" ? `${BACKEND_URL}/api` : "/api";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly fieldErrors?: Record<string, string>,
    readonly retryAfterSeconds?: number | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Subscribe to 401 Unauthorized responses on protected API calls (single centralized handler). */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function isAuthCredentialEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return (
    url.includes("/auth/sign-in") ||
    url.includes("/auth/sign-up") ||
    url.includes("/auth/get-session")
  );
}

function parseRetryAfter(headerValue: unknown): number | undefined {
  if (typeof headerValue !== "string" && typeof headerValue !== "number") {
    return undefined;
  }
  const parsed = Number(headerValue);
  if (Number.isFinite(parsed) && parsed > 0) return Math.ceil(parsed);
  return undefined;
}

function parseFieldErrors(
  rawErrors: unknown,
): Record<string, string> | undefined {
  if (!rawErrors || typeof rawErrors !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(
    rawErrors as Record<string, unknown>,
  )) {
    if (typeof val === "string" && val.trim()) {
      out[key] = val.trim();
    } else if (Array.isArray(val) && typeof val[0] === "string" && val[0].trim()) {
      out[key] = val[0].trim();
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// Backend errors come back as `{ message, code }` (controllers, better-auth) or `{ error }` (auth middleware).
function toApiError(cause: unknown): ApiError {
  if (!isAxiosError(cause)) {
    return new ApiError(0, "Something went wrong. Please try again.");
  }
  if (!cause.response) {
    return new ApiError(0, "Could not reach the server. Check your connection.");
  }

  const body = cause.response.data as
    | {
        message?: string;
        error?: string;
        code?: string;
        errors?: Record<string, unknown>;
        fieldErrors?: Record<string, unknown>;
      }
    | undefined;
  const retryAfterSeconds = parseRetryAfter(
    cause.response.headers?.["retry-after"],
  );
  const fieldErrors = parseFieldErrors(body?.fieldErrors ?? body?.errors);

  return new ApiError(
    cause.response.status,
    body?.message ??
      body?.error ??
      `Request failed with status ${cause.response.status}`,
    typeof body?.code === "string" ? body.code : undefined,
    fieldErrors,
    retryAfterSeconds,
  );
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (response) => response,
  (cause) => {
    if (axios.isCancel(cause)) return Promise.reject(cause);
    const apiError = toApiError(cause);
    if (
      typeof window !== "undefined" &&
      apiError.status === 401 &&
      isAxiosError(cause) &&
      !isAuthCredentialEndpoint(cause.config?.url)
    ) {
      unauthorizedListeners.forEach((listener) => listener());
    }
    return Promise.reject(apiError);
  },
);

/** Standard envelope returned by the backend controllers. */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface Paginated<T> extends ApiResponse<T[]> {
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
