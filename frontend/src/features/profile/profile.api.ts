import axios from "axios";
import { safeExternalUrl } from "@/src/components/catalog/CatalogDetails";
import { ApiError, api, type ApiResponse } from "@/src/lib/api-client";
import type {
  CreateProfileInput,
  ProfileErrorKind,
  UpdateProfileInput,
  UserProfile,
} from "./profile.type";

export class ProfileApiError extends ApiError {
  constructor(
    status: number,
    message: string,
    readonly kind: ProfileErrorKind,
    fieldErrors?: Record<string, string>,
    retryAfterSeconds?: number | null,
  ) {
    super(status, message, undefined, fieldErrors, retryAfterSeconds);
    this.name = "ProfileApiError";
  }
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeSkills(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return [
      ...new Set(
        raw
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return normalizeSkills(parsed);
    } catch {
      return [
        ...new Set(
          raw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ];
    }
  }
  return [];
}

function normalizeExperience(raw: unknown): string | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
  }
  if (Array.isArray(raw)) {
    const joined = raw
      .map((item) =>
        typeof item === "string" ? item.trim() : JSON.stringify(item),
      )
      .filter(Boolean)
      .join("\n");
    return joined || null;
  }
  if (raw && typeof raw === "object") {
    const text = JSON.stringify(raw);
    return text === "{}" ? null : text;
  }
  return null;
}

export function normalizeProfile(raw: unknown): UserProfile {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const rawYear = obj.graduationYear;
  const graduationYear =
    typeof rawYear === "number" &&
    Number.isInteger(rawYear) &&
    rawYear >= 1950 &&
    rawYear <= 2040
      ? rawYear
      : typeof rawYear === "string" && /^\d{4}$/.test(rawYear.trim())
        ? Number(rawYear.trim())
        : null;

  return {
    userId: typeof obj.userId === "string" ? obj.userId : String(obj.userId ?? ""),
    firstName: cleanString(obj.firstName) ?? "",
    lastName: cleanString(obj.lastName) ?? "",
    gender: cleanString(obj.gender),
    country: cleanString(obj.country),
    governorate: cleanString(obj.governorate),
    university: cleanString(obj.university),
    faculty: cleanString(obj.faculty),
    department: cleanString(obj.department),
    graduationYear,
    linkedinUrl: safeExternalUrl(cleanString(obj.linkedinUrl)),
    githubUrl: safeExternalUrl(cleanString(obj.githubUrl)),
    scholarUrl: safeExternalUrl(cleanString(obj.scholarUrl)),
    skills: normalizeSkills(obj.skills),
    experience: normalizeExperience(obj.experience),
  };
}

export function classifyProfileError(cause: unknown): ProfileApiError {
  if (cause instanceof ProfileApiError) return cause;
  if (cause instanceof ApiError) {
    if (cause.status === 0) {
      return new ProfileApiError(
        0,
        "Unable to reach the server. Check your connection and try again.",
        "network",
      );
    }
    if (cause.status === 401) {
      return new ProfileApiError(
        401,
        "Your session has expired. Please sign in again.",
        "unauthorized",
      );
    }
    if (cause.status === 403) {
      return new ProfileApiError(
        403,
        "You do not have permission to perform this action.",
        "forbidden",
      );
    }
    if (cause.status === 404) {
      return new ProfileApiError(404, "Profile not found.", "not_found");
    }
    if (cause.status === 409) {
      return new ProfileApiError(
        409,
        cause.message || "A profile already exists for this account.",
        "conflict",
      );
    }
    if (cause.status === 429) {
      const wait = cause.retryAfterSeconds
        ? ` Please wait ${cause.retryAfterSeconds} seconds and try again.`
        : " Please wait a moment and try again.";
      return new ProfileApiError(
        429,
        `Too many requests.${wait}`,
        "rate_limited",
        undefined,
        cause.retryAfterSeconds,
      );
    }
    if (cause.status === 400 || cause.status === 422) {
      return new ProfileApiError(
        cause.status,
        cause.message || "Please check your profile fields and try again.",
        "validation",
        cause.fieldErrors,
      );
    }
    if (cause.status >= 500) {
      return new ProfileApiError(
        cause.status,
        "The profile service encountered an error. Please try again shortly.",
        "server",
      );
    }
    return new ProfileApiError(
      cause.status,
      cause.message || "Profile request failed.",
      "unknown",
      cause.fieldErrors,
    );
  }
  return new ProfileApiError(
    0,
    cause instanceof Error && cause.message
      ? cause.message
      : "Something went wrong. Please try again.",
    "unknown",
  );
}

/**
 * Fetches the signed-in user's profile via `GET /api/profile`.
 * Returns `null` when the backend responds `404` (no profile created yet).
 */
export async function fetchMyProfile(
  signal?: AbortSignal,
): Promise<UserProfile | null> {
  try {
    const { data } = await api.get<ApiResponse<unknown>>("/profile", { signal });
    if (!data?.data) return null;
    return normalizeProfile(data.data);
  } catch (cause) {
    if (axios.isCancel(cause)) throw cause;
    const classified = classifyProfileError(cause);
    if (classified.kind === "not_found") return null;
    throw classified;
  }
}

/** Creates the signed-in user's profile via `POST /api/profile`. Never sends userId or role. */
export async function createMyProfile(
  input: CreateProfileInput,
): Promise<UserProfile> {
  try {
    const { data } = await api.post<ApiResponse<unknown>>("/profile", input);
    return normalizeProfile(data?.data);
  } catch (cause) {
    if (axios.isCancel(cause)) throw cause;
    throw classifyProfileError(cause);
  }
}

/** Updates only changed fields on the signed-in user's profile via `PATCH /api/profile`. */
export async function updateMyProfile(
  changes: UpdateProfileInput,
): Promise<UserProfile> {
  try {
    const { data } = await api.patch<ApiResponse<unknown>>("/profile", changes);
    return normalizeProfile(data?.data);
  } catch (cause) {
    if (axios.isCancel(cause)) throw cause;
    throw classifyProfileError(cause);
  }
}

/**
 * Deletes the signed-in user's profile row via `DELETE /api/profile/:id`.
 * Note: Backend removes ONLY the Profile record (the User account and session remain active).
 */
export async function deleteMyProfile(userId: string): Promise<void> {
  const encodedId = encodeURIComponent(userId.trim());
  if (!encodedId) {
    throw new ProfileApiError(400, "Missing profile identifier.", "validation");
  }
  try {
    await api.delete(`/profile/${encodedId}`);
  } catch (cause) {
    if (axios.isCancel(cause)) throw cause;
    throw classifyProfileError(cause);
  }
}
