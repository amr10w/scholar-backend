"use client";

import Link from "next/link";
import { Suspense, useEffect, useId, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CircleUserRound, Loader2 } from "lucide-react";
import AuthShell from "../../components/auth/AuthShell";
import Button from "../../components/ui/Button/Button";
import { Input } from "../../components/ui/InputField/Input";
import {
  signInWithEmail,
  signInWithSocial,
  type SocialProvider,
} from "@/src/features/auth/auth.api";
import { useAuth } from "@/src/features/auth/AuthContext";
import {
  AuthApiError,
  isValidEmail,
  sanitizeReturnTo,
} from "@/src/features/auth/auth.utils";

const SOCIAL_PROVIDERS: { id: SocialProvider; label: string }[] = [
  { id: "google", label: "Google" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "facebook", label: "Facebook" },
];

function mapOAuthQueryError(code: string | null): string | null {
  if (!code) return null;
  const lower = code.trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes("access_denied") || lower.includes("cancel")) {
    return "Social sign-in was cancelled. You can try again or sign in with email.";
  }
  return "Social sign-in could not be completed. Please try again or use email and password.";
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    status,
    sessionNotice,
    clearSessionNotice,
    setAuthenticatedUser,
    refreshSession,
  } = useAuth();
  const formId = useId();

  const safeReturnTo = sanitizeReturnTo(
    searchParams.get("returnTo") ?? searchParams.get("next"),
    "/",
  );
  const oauthError = mapOAuthQueryError(searchParams.get("error"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(
    null,
  );

  // Redirect already signed-in users away from login
  useEffect(() => {
    if (status === "authenticated") {
      router.replace(safeReturnTo);
    }
  }, [status, router, safeReturnTo]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || pendingProvider) return;

    const nextFieldErrors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      nextFieldErrors.email = "Email is required.";
    } else if (!isValidEmail(email)) {
      nextFieldErrors.email = "Please enter a valid email address.";
    }
    if (!password) {
      nextFieldErrors.password = "Password is required.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setErrorMessage("Please enter your email and password.");
      return;
    }

    setFieldErrors({});
    setErrorMessage("");
    clearSessionNotice();
    setIsSubmitting(true);

    try {
      const user = await signInWithEmail(email, password);
      setAuthenticatedUser(user);
      void refreshSession({ silent: true });
      router.replace(safeReturnTo);
    } catch (cause) {
      if (cause instanceof AuthApiError) {
        if (cause.fieldErrors) {
          setFieldErrors({
            email: cause.fieldErrors.email,
            password: cause.fieldErrors.password,
          });
        }
        setErrorMessage(cause.message);
      } else {
        setErrorMessage(
          cause instanceof Error ? cause.message : "Login failed. Try again.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSocial = async (provider: SocialProvider) => {
    if (isSubmitting || pendingProvider) return;
    setErrorMessage("");
    setFieldErrors({});
    clearSessionNotice();
    setPendingProvider(provider);

    try {
      const targetAfterSocial = safeReturnTo === "/" ? "/profile" : safeReturnTo;
      await signInWithSocial(provider, targetAfterSocial);
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error
          ? cause.message
          : `${provider} sign-in is unavailable right now.`,
      );
      setPendingProvider(null);
    }
  };

  const bannerMessage = errorMessage || oauthError;
  const emailId = `${formId}-email`;
  const emailErrorId = `${formId}-email-error`;
  const passwordId = `${formId}-password`;
  const passwordErrorId = `${formId}-password-error`;

  return (
    <AuthShell>
      <section className="w-full max-w-md animate-[fadeInUp_500ms_ease-out]">
        <div className="rounded-4xl border border-primary-300/40 bg-surface/90 px-6 py-8 shadow-[0_0_0_1px_rgba(90,167,214,0.18),0_0_75px_rgba(11,34,54,0.35)] backdrop-blur-2xl sm:px-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent-400/90 bg-accent-400/10 text-accent-300 shadow-[0_0_24px_rgba(55,181,170,0.22)]">
            <CircleUserRound aria-hidden="true" className="h-8 w-8" />
          </div>

          <div className="mt-4 text-center">
            <h1 className="text-h2-sm font-semibold text-neutral-50 sm:text-h2">
              Welcome Back
            </h1>
            <p className="mt-2 text-subtext text-neutral-200">
              Continue your journey in research and innovation
            </p>
          </div>

          {sessionNotice && !bannerMessage && (
            <div
              role="status"
              className="mt-4 flex items-start gap-2 rounded-xl border border-accent-400/50 bg-accent-700/20 px-3.5 py-2.5 text-sm text-accent-200"
            >
              <AlertCircle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <span>{sessionNotice}</span>
            </div>
          )}

          <form onSubmit={handleLogin} noValidate className="mt-6 space-y-3">
            <div>
              <Input
                id={emailId}
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Enter your email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  setErrorMessage("");
                }}
                error={fieldErrors.email}
                aria-describedby={fieldErrors.email ? emailErrorId : undefined}
                required
              />
              {fieldErrors.email && (
                <p id={emailErrorId} className="mt-1 text-xs text-danger-300">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <Input
                id={passwordId}
                label="Password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  setErrorMessage("");
                }}
                error={fieldErrors.password}
                aria-describedby={
                  fieldErrors.password ? passwordErrorId : undefined
                }
                required
              />
              {fieldErrors.password && (
                <p
                  id={passwordErrorId}
                  className="mt-1 text-xs text-danger-300"
                >
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {bannerMessage ? (
              <p
                role="alert"
                className="rounded-xl border border-danger-400/50 bg-danger-800/20 px-3 py-2 text-center text-sm text-danger-300"
              >
                {bannerMessage}
              </p>
            ) : null}

            <div className="pt-2">
              <Button
                className="h-11 w-full rounded-[0.7rem] bg-action-primary px-4 text-base font-semibold text-on-action hover:bg-action-primary-hover"
                intent="primary"
                type="submit"
                variant="solid"
                disabled={isSubmitting || Boolean(pendingProvider)}
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2
                      aria-hidden="true"
                      className="size-4 motion-safe:animate-spin"
                    />
                    Logging In…
                  </span>
                ) : (
                  "Login"
                )}
              </Button>
            </div>
          </form>

          <div className="my-5 flex items-center gap-3 text-neutral-300">
            <span className="h-px flex-1 bg-neutral-500/60" />
            <span className="text-sm tracking-wide">Or Continue With</span>
            <span className="h-px flex-1 bg-neutral-500/60" />
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {SOCIAL_PROVIDERS.map((provider) => {
              const isBusy = pendingProvider === provider.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  disabled={isSubmitting || Boolean(pendingProvider)}
                  onClick={() => void handleSocial(provider.id)}
                  className="flex h-11 w-full items-center justify-center rounded-[0.7rem] border border-accent-400/70 bg-action-accent/15 px-3 text-sm font-semibold text-accent-200 transition-colors hover:bg-action-accent hover:text-on-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {isBusy ? "Redirecting…" : provider.label}
                </button>
              );
            })}
          </div>

          <p className="mt-5 text-center text-sm text-neutral-200">
            New Here?{" "}
            <Link
              href={
                safeReturnTo !== "/"
                  ? `/signup?returnTo=${encodeURIComponent(safeReturnTo)}`
                  : "/signup"
              }
              className="text-accent-200 transition-colors hover:text-accent-100"
            >
              Create Account
            </Link>
          </p>
        </div>
      </section>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <div className="h-96 w-full max-w-md rounded-4xl border border-primary-300/30 bg-surface/60 motion-safe:animate-pulse" />
        </AuthShell>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
