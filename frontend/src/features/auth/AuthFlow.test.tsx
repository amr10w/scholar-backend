import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const {
  routerPush,
  routerReplace,
  mockSearchParams,
  mockPathname,
  getSession,
  signInWithEmail,
  signUpWithEmail,
  signInWithSocial,
  signOut,
  fetchMyProfile,
  createMyProfile,
  updateMyProfile,
  deleteMyProfile,
} = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  mockSearchParams: { current: new URLSearchParams() },
  mockPathname: { current: "/" },
  getSession: vi.fn(),
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithSocial: vi.fn(),
  signOut: vi.fn(),
  fetchMyProfile: vi.fn(),
  createMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
  deleteMyProfile: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  usePathname: () => mockPathname.current,
  useSearchParams: () => mockSearchParams.current,
}));

vi.mock("@/src/features/auth/auth.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./auth.api")>();
  return {
    ...actual,
    getSession,
    signInWithEmail,
    signUpWithEmail,
    signInWithSocial,
    signOut,
  };
});

vi.mock("@/src/features/profile/profile.api", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/src/features/profile/profile.api")
  >();
  return {
    ...actual,
    fetchMyProfile,
    createMyProfile,
    updateMyProfile,
    deleteMyProfile,
  };
});

import Header from "@/src/components/Header";
import LoginPage from "@/src/app/login/page";
import SignupPage from "@/src/app/signup/page";
import ProfilePageClient from "@/src/features/profile/components/ProfilePageClient";
import { AuthProvider, resetAuthSessionCacheForTests } from "./AuthContext";
import { AuthApiError } from "./auth.utils";
import { ProfileApiError } from "@/src/features/profile/profile.api";

const SIGNED_IN_SESSION = {
  session: { id: "sess-1", userId: "user-1", expiresAt: "2026-12-01T00:00:00Z" },
  user: {
    id: "user-1",
    name: "Nadia Mansour",
    email: "nadia@example.com",
    emailVerified: false,
    role: "student" as const,
  },
};

const SAMPLE_PROFILE = {
  userId: "user-1",
  firstName: "Nadia",
  lastName: "Mansour",
  gender: "female",
  country: "Egypt",
  governorate: "Cairo",
  university: "Cairo University",
  faculty: "Engineering",
  department: "Electronics",
  graduationYear: 2026,
  linkedinUrl: "https://linkedin.com/in/nadia",
  githubUrl: null,
  scholarUrl: null,
  skills: ["VLSI", "Python"],
  experience: "<b>Plain text only</b><script>alert(1)</script>",
};

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  resetAuthSessionCacheForTests();
  routerPush.mockReset();
  routerReplace.mockReset();
  mockSearchParams.current = new URLSearchParams();
  mockPathname.current = "/";
  getSession.mockReset();
  signInWithEmail.mockReset();
  signUpWithEmail.mockReset();
  signInWithSocial.mockReset();
  signOut.mockReset();
  fetchMyProfile.mockReset();
  createMyProfile.mockReset();
  updateMyProfile.mockReset();
  deleteMyProfile.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthProvider & Header", () => {
  it("deduplicates getSession under StrictMode, shows neutral placeholder without Login flash, and handles keyboard user menu + sign-out", async () => {
    let resolveSession!: (val: typeof SIGNED_IN_SESSION | null) => void;
    getSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSession = resolve;
        }),
    );

    render(
      <StrictMode>
        <AuthProvider>
          <Header />
        </AuthProvider>
      </StrictMode>,
    );

    // Loading state shows neutral placeholder, NOT the Login button
    expect(screen.getByTestId("header-auth-loading")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log in" })).toBeNull();
    expect(getSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSession(SIGNED_IN_SESSION);
    });

    const trigger = await screen.findByRole("button", {
      name: /Nadia Mansour/i,
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: /Profile/i })).toHaveAttribute(
      "href",
      "/profile",
    );

    // Escape closes menu and returns focus to trigger
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(trigger);

    // Sign-out failure keeps user signed in and surfaces alert
    fireEvent.click(trigger);
    signOut.mockRejectedValueOnce(new AuthApiError(500, "Sign-out failed", "server"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Sign out/i }));
    const menu = screen.getByRole("menu");
    expect(await within(menu).findByRole("alert")).toHaveTextContent(
      "Sign-out failed",
    );

    // Sign-out success clears session and redirects home
    signOut.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("menuitem", { name: /Sign out/i }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/"));
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });
});

describe("LoginPage", () => {
  it("blocks external returnTo, respects safe internal returnTo, and handles social provider errors gracefully", async () => {
    getSession.mockResolvedValue(null);
    mockSearchParams.current = new URLSearchParams("returnTo=//evil.com/steal");

    signInWithEmail.mockResolvedValueOnce(SIGNED_IN_SESSION.user);
    signInWithSocial.mockRejectedValueOnce(
      new AuthApiError(
        500,
        "This social sign-in provider is not available right now.",
        "provider_unavailable",
      ),
    );

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(getSession).toHaveBeenCalled());

    // Social provider failure shows graceful alert without breaking page
    fireEvent.click(screen.getByRole("button", { name: "Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /not available right now/i,
    );

    // Sign-in with malicious returnTo falls back to "/"
    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "nadia@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "StrongPass123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/"));
  });

  it("redirects already signed-in users away from /login", async () => {
    getSession.mockResolvedValue(SIGNED_IN_SESSION);
    mockSearchParams.current = new URLSearchParams("returnTo=%2Fprofile");

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/profile"));
  });
});

describe("SignupPage (with recoverable profile completion step)", () => {
  it("completes account signup, recovers from a failed POST /api/profile, and reaches ready state", async () => {
    getSession.mockResolvedValue(null);
    signUpWithEmail.mockResolvedValueOnce(SIGNED_IN_SESSION.user);
    createMyProfile
      .mockRejectedValueOnce(
        new ProfileApiError(500, "Temporary server error", "server"),
      )
      .mockResolvedValueOnce(SAMPLE_PROFILE);

    render(
      <AuthProvider>
        <SignupPage />
      </AuthProvider>,
    );
    await waitFor(() => expect(getSession).toHaveBeenCalled());

    // Step 1: stage -> Step 2: account
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    fireEvent.change(screen.getByPlaceholderText("Enter your full name"), {
      target: { value: "Nadia Mansour" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "nadia@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), {
      target: { value: "StrongPass123!" },
    });
    fireEvent.change(screen.getByPlaceholderText("Re-enter your password"), {
      target: { value: "StrongPass123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create My Account" }));

    // Step 3: Complete Your Profile (pre-filled First/Last Name)
    expect(
      await screen.findByRole("heading", { name: "Complete Your Profile" }),
    ).toBeInTheDocument();

    // First attempt fails -> user stays on form, sees error + Finish Later
    fireEvent.click(screen.getByRole("button", { name: "Complete Profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Temporary server error",
    );
    expect(
      screen.getByRole("button", { name: "Finish Later" }),
    ).toBeInTheDocument();

    // Retry succeeds -> Step 4: ready
    fireEvent.click(screen.getByRole("button", { name: "Complete Profile" }));
    expect(
      await screen.findByRole("heading", { name: "Your Profile Is Ready!" }),
    ).toBeInTheDocument();
  });
});

describe("ProfilePageClient (protected route, plain-text rendering, partial PATCH, Delete Profile)", () => {
  it("redirects unauthenticated visitors to /login?returnTo=%2Fprofile", async () => {
    getSession.mockResolvedValue(null);
    render(
      <AuthProvider>
        <ProfilePageClient />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith("/login?returnTo=%2Fprofile"),
    );
  });

  it("renders profile safely as plain text, sends partial PATCH, updates header name, and requires typed DELETE confirmation", async () => {
    getSession.mockResolvedValue(SIGNED_IN_SESSION);
    fetchMyProfile.mockResolvedValue(SAMPLE_PROFILE);
    updateMyProfile.mockResolvedValue({
      ...SAMPLE_PROFILE,
      firstName: "Nadia-Updated",
    });
    deleteMyProfile.mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <Header />
        <ProfilePageClient />
      </AuthProvider>,
    );

    // Script-like experience text renders literally as plain text (no <script> tag executed)
    expect(
      await screen.findByText("<b>Plain text only</b><script>alert(1)</script>"),
    ).toBeInTheDocument();

    // Edit Profile: Save disabled until a field changes
    fireEvent.click(screen.getByRole("button", { name: /Edit Profile/i }));
    const saveBtn = screen.getByRole("button", { name: "Save Changes" });
    expect(saveBtn).toBeDisabled();

    fireEvent.change(screen.getByDisplayValue("Nadia"), {
      target: { value: "Nadia-Updated" },
    });
    expect(saveBtn).toBeEnabled();
    fireEvent.click(saveBtn);

    await waitFor(() =>
      expect(updateMyProfile).toHaveBeenCalledWith({
        firstName: "Nadia-Updated",
      }),
    );

    // Header display name updated live
    expect(
      await screen.findByRole("button", { name: /Nadia-Updated Mansour/i }),
    ).toBeInTheDocument();

    // Delete Profile requires typing DELETE and explains what remains
    fireEvent.click(screen.getByRole("button", { name: /Delete Profile/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/login account/i);

    const confirmBtn = within(dialog).getByRole("button", {
      name: /^Delete Profile$/i,
    });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("DELETE"), {
      target: { value: "DELETE" },
    });
    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(deleteMyProfile).toHaveBeenCalledWith("user-1"));
    expect(
      await screen.findByRole("heading", { name: "Complete Your Profile" }),
    ).toBeInTheDocument();
  });
});
