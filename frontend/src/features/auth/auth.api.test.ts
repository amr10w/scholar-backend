import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

const { get, post } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/src/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/api-client")>();
  return {
    ...actual,
    api: { get, post },
  };
});

import { ApiError } from "@/src/lib/api-client";
import {
  getSession,
  requestSocialSignInUrl,
  signInWithEmail,
  signOut,
  signUpWithEmail,
} from "./auth.api";
import {
  AuthApiError,
  classifyAuthError,
  sanitizeReturnTo,
  userInitials,
} from "./auth.utils";

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("sanitizeReturnTo (open-redirect protection)", () => {
  it("accepts safe internal paths with query and hash", () => {
    expect(sanitizeReturnTo("/profile")).toBe("/profile");
    expect(sanitizeReturnTo("/research?tab=papers&page=2#top")).toBe(
      "/research?tab=papers&page=2#top",
    );
  });

  it("rejects off-site, protocol-relative, backslash, encoded, and auth-loop URLs", () => {
    for (const bad of [
      null,
      "",
      "https://evil.example.com/phish",
      "http://evil.example.com",
      "//evil.example.com",
      "/\\evil.example.com",
      "%2f%2fevil.example.com",
      "/%2f/evil.example.com",
      "javascript:alert(1)",
      "/login",
      "/login?returnTo=/profile",
      "/signup",
      "/profile\r\nSet-Cookie: x=1",
    ]) {
      expect(sanitizeReturnTo(bad, "/")).toBe("/");
    }
  });
});

describe("auth.api & error classification", () => {
  it("trims email, signs in, and normalizes AuthUser", async () => {
    post.mockResolvedValueOnce({
      data: {
        token: "redacted",
        user: {
          id: "u-1",
          name: "Nadia Mansour",
          email: "nadia@example.com",
          emailVerified: false,
          role: "student",
        },
      },
    });

    const user = await signInWithEmail("  nadia@example.com  ", "Pass1234!");
    expect(post).toHaveBeenCalledWith("/auth/sign-in/email", {
      email: "nadia@example.com",
      password: "Pass1234!",
    });
    expect(user).toEqual({
      id: "u-1",
      name: "Nadia Mansour",
      email: "nadia@example.com",
      emailVerified: false,
      role: "student",
      image: null,
    });
  });

  it("never sends a privileged role on sign-up", async () => {
    post.mockResolvedValueOnce({
      data: {
        user: {
          id: "u-2",
          name: "Test User",
          email: "test@example.com",
          emailVerified: false,
          role: "student",
        },
      },
    });

    // Even if cast at runtime, client clamps to student/graduate
    await signUpWithEmail(
      "  Test User  ",
      " test@example.com ",
      "StrongPass123!",
      "admin" as unknown as "student",
    );
    expect(post).toHaveBeenCalledWith("/auth/sign-up/email", {
      name: "Test User",
      email: "test@example.com",
      password: "StrongPass123!",
      role: "student",
    });
  });

  it("classifies wrong credentials generically, duplicate email, unverified email, rate limit, network, and 5xx", () => {
    expect(
      classifyAuthError(
        new ApiError(401, "User not found", "USER_NOT_FOUND"),
        "signin",
      ),
    ).toMatchObject({
      kind: "unauthorized",
      message: "Invalid email or password.",
    });

    expect(
      classifyAuthError(
        new ApiError(422, "User already exists", "USER_ALREADY_EXISTS"),
        "signup",
      ),
    ).toMatchObject({
      kind: "conflict",
      fieldErrors: { email: "This email is already registered." },
    });

    expect(
      classifyAuthError(
        new ApiError(403, "Email not verified", "EMAIL_NOT_VERIFIED"),
        "signin",
      ).kind,
    ).toBe("unverified_email");

    const rl = classifyAuthError(
      new ApiError(429, "Too many requests", undefined, undefined, 30),
      "signin",
    );
    expect(rl.kind).toBe("rate_limited");
    expect(rl.message).toContain("30 seconds");

    expect(classifyAuthError(new ApiError(0, "Offline"), "signin").kind).toBe(
      "network",
    );
    expect(classifyAuthError(new ApiError(500, "Crash"), "signin").kind).toBe(
      "server",
    );
  });

  it("validates social redirect URLs and fails gracefully when provider is unconfigured", async () => {
    post.mockResolvedValueOnce({
      data: { url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=1", redirect: true },
    });
    const url = await requestSocialSignInUrl("google", "//evil.com");
    expect(url).toMatch(/^https:\/\/accounts\.google\.com/);
    expect(post).toHaveBeenCalledWith("/auth/sign-in/social", {
      provider: "google",
      callbackURL: `${window.location.origin}/profile`,
    });

    post.mockResolvedValueOnce({ data: { url: "javascript:alert(1)" } });
    await expect(requestSocialSignInUrl("linkedin")).rejects.toMatchObject({
      kind: "provider_unavailable",
    } satisfies Partial<AuthApiError>);

    post.mockRejectedValueOnce(new ApiError(500, "Request failed with status 500"));
    await expect(requestSocialSignInUrl("facebook")).rejects.toMatchObject({
      kind: "provider_unavailable",
    });
  });

  it("handles getSession (signed in, null, 401 -> null, network throws) and signOut", async () => {
    get.mockResolvedValueOnce({ data: null });
    expect(await getSession()).toBeNull();

    get.mockResolvedValueOnce({
      data: {
        session: { id: "s-1", userId: "u-1", expiresAt: "2026-12-01T00:00:00Z" },
        user: {
          id: "u-1",
          name: "Nadia",
          email: "nadia@example.com",
          emailVerified: true,
          role: "graduate",
        },
      },
    });
    const session = await getSession();
    expect(session?.user.role).toBe("graduate");
    expect(session?.session.id).toBe("s-1");

    get.mockRejectedValueOnce(new ApiError(401, "No session"));
    expect(await getSession()).toBeNull();

    get.mockRejectedValueOnce(new ApiError(0, "Network error"));
    await expect(getSession()).rejects.toMatchObject({ kind: "network" });

    const cancel = new axios.CanceledError("aborted");
    get.mockRejectedValueOnce(cancel);
    await expect(getSession()).rejects.toBe(cancel);

    post.mockResolvedValueOnce({ data: { success: true } });
    await expect(signOut()).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledWith("/auth/sign-out", {});

    expect(userInitials("Ahmed Mohamed")).toBe("AM");
    expect(userInitials(null, "test@example.com")).toBe("TE");
  });
});
