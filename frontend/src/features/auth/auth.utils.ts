import { ApiError } from "@/src/lib/api-client";
import { avatarTone } from "@/src/features/research/researchers/researcher.utils";

export type AuthErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "unverified_email"
  | "rate_limited"
  | "provider_unavailable"
  | "network"
  | "server"
  | "unknown";

export class AuthApiError extends ApiError {
  constructor(
    status: number,
    message: string,
    readonly kind: AuthErrorKind,
    code?: string,
    fieldErrors?: Record<string, string>,
    retryAfterSeconds?: number | null,
  ) {
    super(status, message, code, fieldErrors, retryAfterSeconds);
    this.name = "AuthApiError";
  }
}

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/**
 * Validates and normalizes an internal redirect target (open-redirect protection).
 * Rejects off-site URLs, protocol-relative URLs (//evil.com), backslash tricks (/\evil.com),
 * encoded external URLs (%2f%2fevil.com), control characters, and auth page self-loops.
 */
export function sanitizeReturnTo(
  raw: string | null | undefined,
  fallback = "/",
): string {
  if (!raw || typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(trimmed)) return fallback;

  // Reject encoded slashes, backslashes, or schemes before and after decoding
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return fallback;
  }
  if (/[\u0000-\u001f\u007f\\]/.test(decoded)) return fallback;

  // Must start with a single leading `/` and NOT `//` (protocol-relative)
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;

  // Verify against a dummy local origin that host/origin never changes
  try {
    const parsed = new URL(trimmed, "http://local.invalid");
    if (parsed.origin !== "http://local.invalid") return fallback;
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (
      normalized === "/login" ||
      normalized.startsWith("/login?") ||
      normalized === "/signup" ||
      normalized.startsWith("/signup?")
    ) {
      return fallback;
    }
    return normalized;
  } catch {
    return fallback;
  }
}

/** Computes 1–2 uppercase initials from display name or email local-part. */
export function userInitials(
  name: string | null | undefined,
  email?: string | null,
): string {
  const cleanName = (name ?? "").trim();
  if (cleanName) {
    const words = cleanName
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9\p{L}]/gu, ""))
      .filter(Boolean);
    if (words.length >= 2) {
      return `${words[0][0] ?? ""}${words[words.length - 1][0] ?? ""}`.toUpperCase();
    }
    if (words.length === 1) {
      return words[0].slice(0, 2).toUpperCase();
    }
  }
  const cleanEmail = (email ?? "").trim();
  if (cleanEmail) {
    const local = cleanEmail.split("@")[0]?.replace(/[^a-zA-Z0-9]/g, "") ?? "";
    if (local) return local.slice(0, 2).toUpperCase();
  }
  return "?";
}

/** Deterministic avatar background token class reusing the researchers avatarTone palette. */
export function userAvatarTone(seed: string | null | undefined): string {
  const str = (seed ?? "").trim();
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarTone(Math.abs(hash));
}

export function classifyAuthError(
  cause: unknown,
  context: "signin" | "signup" | "social" | "session" | "signout" = "signin",
): AuthApiError {
  if (cause instanceof AuthApiError) return cause;

  if (cause instanceof ApiError) {
    const code = (cause.code ?? "").toUpperCase();
    const lowerMsg = cause.message.toLowerCase();

    if (cause.status === 0) {
      return new AuthApiError(
        0,
        "Unable to reach the server. Check your connection and try again.",
        "network",
        cause.code,
      );
    }

    if (cause.status === 429) {
      const wait = cause.retryAfterSeconds
        ? ` Please wait ${cause.retryAfterSeconds} seconds and try again.`
        : " Please wait a moment and try again.";
      return new AuthApiError(
        429,
        `Too many attempts.${wait}`,
        "rate_limited",
        cause.code,
        undefined,
        cause.retryAfterSeconds,
      );
    }

    if (
      code.includes("EMAIL_NOT_VERIFIED") ||
      lowerMsg.includes("email not verified") ||
      lowerMsg.includes("verify your email")
    ) {
      return new AuthApiError(
        cause.status,
        "Please verify your email address before signing in.",
        "unverified_email",
        cause.code,
      );
    }

    if (
      context === "signup" &&
      (cause.status === 409 ||
        code.includes("USER_ALREADY_EXISTS") ||
        lowerMsg.includes("already exists") ||
        lowerMsg.includes("already registered"))
    ) {
      return new AuthApiError(
        cause.status,
        "An account with this email already exists. Try signing in instead.",
        "conflict",
        cause.code,
        { email: "This email is already registered." },
      );
    }

    if (
      context === "signin" &&
      (cause.status === 401 ||
        code.includes("INVALID_EMAIL_OR_PASSWORD") ||
        code.includes("INVALID_PASSWORD") ||
        code.includes("USER_NOT_FOUND") ||
        lowerMsg.includes("invalid email or password") ||
        lowerMsg.includes("invalid credentials"))
    ) {
      // Generic message to prevent account enumeration
      return new AuthApiError(
        401,
        "Invalid email or password.",
        "unauthorized",
        cause.code,
      );
    }

    if (cause.status === 401) {
      return new AuthApiError(
        401,
        "Your session has expired. Please sign in again.",
        "unauthorized",
        cause.code,
      );
    }

    if (cause.status === 403) {
      return new AuthApiError(
        403,
        cause.message || "You do not have permission to perform this action.",
        "forbidden",
        cause.code,
      );
    }

    if (cause.status === 400 || cause.status === 422) {
      const fieldErrors: Record<string, string> = { ...(cause.fieldErrors ?? {}) };
      if (!fieldErrors.password && lowerMsg.includes("password")) {
        fieldErrors.password = cause.message;
      }
      if (!fieldErrors.email && lowerMsg.includes("email")) {
        fieldErrors.email = cause.message;
      }
      if (!fieldErrors.name && lowerMsg.includes("name")) {
        fieldErrors.name = cause.message;
      }
      return new AuthApiError(
        cause.status,
        cause.message || "Please check the highlighted fields and try again.",
        "validation",
        cause.code,
        Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
      );
    }

    if (context === "social" && cause.status >= 400) {
      return new AuthApiError(
        cause.status,
        "This social sign-in provider is not available right now. Please sign in with email and password.",
        "provider_unavailable",
        cause.code,
      );
    }

    if (cause.status >= 500) {
      return new AuthApiError(
        cause.status,
        "The authentication service encountered an error. Please try again shortly.",
        "server",
        cause.code,
      );
    }

    return new AuthApiError(
      cause.status,
      cause.message || "Authentication request failed.",
      "unknown",
      cause.code,
      cause.fieldErrors,
    );
  }

  return new AuthApiError(
    0,
    cause instanceof Error && cause.message
      ? cause.message
      : "Something went wrong. Please try again.",
    "unknown",
  );
}
