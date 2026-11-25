import axios from "axios";
import { api } from "@/src/lib/api-client";
import {
  AuthApiError,
  classifyAuthError,
  sanitizeReturnTo,
} from "./auth.utils";

// better-auth endpoints mounted by the backend at /api/auth/*.
// The session lives in an HttpOnly cookie managed by the backend;
// no token is ever stored in JS-accessible storage.

export type UserRole = "student" | "graduate" | "admin";
/** Non-privileged roles allowed for self-service client sign-up. */
export type SignupRole = "student" | "graduate";
export type SocialProvider = "google" | "linkedin" | "facebook";

export interface AuthUser {
  id: string;
  name: string | null;
  email: string;
  emailVerified: boolean;
  role: UserRole;
  image?: string | null;
}

export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: string;
}

export interface SessionData {
  session: AuthSession;
  user: AuthUser;
}

interface RawAuthResponse {
  user?: Record<string, unknown> | null;
}

interface RawSessionResponse {
  session?: Record<string, unknown> | null;
  user?: Record<string, unknown> | null;
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeRole(value: unknown): UserRole {
  if (value === "student" || value === "graduate" || value === "admin") {
    return value;
  }
  return "student";
}

export function normalizeAuthUser(raw: unknown): AuthUser {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    id: typeof obj.id === "string" ? obj.id : String(obj.id ?? ""),
    name: cleanString(obj.name),
    email: cleanString(obj.email) ?? "",
    emailVerified: Boolean(obj.emailVerified),
    role: normalizeRole(obj.role),
    image: cleanString(obj.image),
  };
}

function normalizeSession(raw: unknown): AuthSession | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id : String(obj.id ?? "");
  const userId =
    typeof obj.userId === "string" ? obj.userId : String(obj.userId ?? "");
  const expiresAt = cleanString(obj.expiresAt) ?? "";
  if (!id || !userId) return null;
  return { id, userId, expiresAt };
}

function isSafeRedirectUrl(rawUrl: unknown): rawUrl is string {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthUser> {
  try {
    const { data } = await api.post<RawAuthResponse>("/auth/sign-in/email", {
      email: email.trim(),
      password,
    });
    if (!data?.user) {
      throw new AuthApiError(
        500,
        "Sign-in response was missing user details. Please try again.",
        "server",
      );
    }
    return normalizeAuthUser(data.user);
  } catch (cause) {
    if (axios.isCancel(cause)) throw cause;
    throw classifyAuthError(cause, "signin");
  }
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
  role: SignupRole = "student",
): Promise<AuthUser> {
  // Never allow client sign-up to send a privileged role (e.g. "admin").
  const safeRole: SignupRole = role === "graduate" ? "graduate" : "student";
  try {
    const { data } = await api.post<RawAuthResponse>("/auth/sign-up/email", {
      name: name.trim(),
      email: email.trim(),
      password,
      role: safeRole,
    });
    if (!data?.user) {
      throw new AuthApiError(
        500,
        "Account creation response was incomplete. Please try signing in.",
        "server",
      );
    }
    return normalizeAuthUser(data.user);
  } catch (cause) {
    if (axios.isCancel(cause)) throw cause;
    throw classifyAuthError(cause, "signup");
  }
}

/**
 * Initiates Better Auth social OAuth flow and returns the validated provider redirect URL.
 * Callers navigate the browser to the returned URL only after validation succeeds.
 */
export async function requestSocialSignInUrl(
  provider: SocialProvider,
  returnTo = "/profile",
): Promise<string> {
  const safePath = sanitizeReturnTo(returnTo, "/profile");
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const callbackURL = `${origin}${safePath}`;

  try {
    const { data } = await api.post<{ url?: string; redirect?: boolean }>(
      "/auth/sign-in/social",
      { provider, callbackURL },
    );
    if (!isSafeRedirectUrl(data?.url)) {
      throw new AuthApiError(
        502,
        `${provider.charAt(0).toUpperCase() + provider.slice(1)} sign-in is not configured right now. Please sign in with email and password.`,
        "provider_unavailable",
      );
    }
    return data.url;
  } catch (cause) {
    if (axios.isCancel(cause)) throw cause;
    throw classifyAuthError(cause, "social");
  }
}

export async function signInWithSocial(
  provider: SocialProvider,
  returnTo = "/profile",
): Promise<void> {
  const url = await requestSocialSignInUrl(provider, returnTo);
  window.location.assign(url);
}

/**
 * Fetches the current Better Auth session via the HttpOnly cookie.
 * Returns `null` when signed out; throws `AuthApiError` on network/5xx errors so
 * callers can distinguish "signed out" from "backend unreachable (unknown)".
 */
export async function getSession(
  signal?: AbortSignal,
): Promise<SessionData | null> {
  try {
    const { data } = await api.get<RawSessionResponse | null>(
      "/auth/get-session",
      { signal },
    );
    if (!data || !data.user || !data.session) return null;
    const session = normalizeSession(data.session);
    const user = normalizeAuthUser(data.user);
    if (!session || !user.id) return null;
    return { session, user };
  } catch (cause) {
    if (axios.isCancel(cause)) throw cause;
    const classified = classifyAuthError(cause, "session");
    if (classified.status === 401) return null;
    throw classified;
  }
}

/** Terminates the server-side Better Auth session and clears the HttpOnly cookie. */
export async function signOut(): Promise<void> {
  try {
    await api.post("/auth/sign-out", {});
  } catch (cause) {
    if (axios.isCancel(cause)) throw cause;
    throw classifyAuthError(cause, "signout");
  }
}
