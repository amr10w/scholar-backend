"use client";

import Link from "next/link";
import { Suspense, useEffect, useId, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  GraduationCap,
  Loader2,
  School,
  UserPlus,
  UserRoundCheck,
} from "lucide-react";
import AuthShell from "../../components/auth/AuthShell";
import Button from "../../components/ui/Button/Button";
import { Input } from "../../components/ui/InputField/Input";
import {
  signUpWithEmail,
  type SignupRole,
} from "@/src/features/auth/auth.api";
import { useAuth } from "@/src/features/auth/AuthContext";
import {
  AuthApiError,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  isValidEmail,
  sanitizeReturnTo,
} from "@/src/features/auth/auth.utils";
import { createMyProfile } from "@/src/features/profile/profile.api";
import ProfileForm from "@/src/features/profile/components/ProfileForm";
import type { UserProfile } from "@/src/features/profile/profile.type";

type SignupStage = "student" | "graduate" | "industry";
type SignupStep = "stage" | "account" | "complete-profile" | "success";

const stageCards: Array<{
  id: SignupStage;
  title: string;
  description: string;
  icon: typeof GraduationCap;
}> = [
  {
    id: "student",
    title: "Student",
    description: "Currently Enrolled In A University",
    icon: School,
  },
  {
    id: "graduate",
    title: "Graduate",
    description: "Completed Your Degree",
    icon: GraduationCap,
  },
  {
    id: "industry",
    title: "Industry Professional",
    description: "Working In Your Field",
    icon: Building2,
  },
];

const stageToRole: Record<SignupStage, SignupRole> = {
  student: "student",
  graduate: "graduate",
  industry: "graduate",
};

function SignupFlowContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    status,
    setAuthenticatedUser,
    refreshSession,
    updateDisplayName,
  } = useAuth();
  const formId = useId();

  const safeReturnTo = sanitizeReturnTo(
    searchParams.get("returnTo") ?? searchParams.get("next"),
    "/profile",
  );

  const [currentStep, setCurrentStep] = useState<SignupStep>("stage");
  const [selectedStage, setSelectedStage] = useState<SignupStage>("student");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect already signed-in visitors away unless they just created an account in this flow
  useEffect(() => {
    if (
      status === "authenticated" &&
      (currentStep === "stage" || currentStep === "account")
    ) {
      router.replace(safeReturnTo);
    }
  }, [status, currentStep, router, safeReturnTo]);

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const nextErrors: typeof fieldErrors = {};
    if (!fullName.trim()) {
      nextErrors.fullName = "Full name is required.";
    } else if (fullName.trim().length > 120) {
      nextErrors.fullName = "Full name must be 120 characters or fewer.";
    }

    if (!email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!isValidEmail(email)) {
      nextErrors.email = "Please enter a valid email address.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      nextErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    } else if (password.length > MAX_PASSWORD_LENGTH) {
      nextErrors.password = `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
    }

    if (password !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setFormError("Please fix the highlighted fields to continue.");
      return;
    }

    setFieldErrors({});
    setFormError("");
    setIsSubmitting(true);

    try {
      const user = await signUpWithEmail(
        fullName,
        email,
        password,
        stageToRole[selectedStage],
      );
      setAuthenticatedUser(user);
      void refreshSession({ silent: true });
      setCurrentStep("complete-profile");
    } catch (cause) {
      if (cause instanceof AuthApiError) {
        if (cause.fieldErrors) {
          setFieldErrors({
            fullName: cause.fieldErrors.name,
            email: cause.fieldErrors.email,
            password: cause.fieldErrors.password,
          });
        }
        setFormError(cause.message);
      } else {
        setFormError(
          cause instanceof Error ? cause.message : "Sign up failed. Try again.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProfileCreated = (profile: UserProfile) => {
    const combined = `${profile.firstName} ${profile.lastName}`.trim();
    if (combined) updateDisplayName(combined);
    setCurrentStep("success");
  };

  return (
    <AuthShell>
      {currentStep === "stage" && (
        <section className="w-full max-w-216 animate-[fadeInUp_500ms_ease-out]">
          <div className="rounded-4xl border border-primary-300/35 bg-surface/90 px-6 py-8 shadow-[0_0_0_1px_rgba(90,167,214,0.16),0_0_75px_rgba(11,34,54,0.32)] backdrop-blur-2xl sm:px-8 lg:px-12 lg:py-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary-300/80 bg-primary-400/10 text-primary-300 shadow-[0_0_24px_rgba(58,144,201,0.24)]">
              <UserPlus aria-hidden="true" className="h-8 w-8" />
            </div>

            <div className="mt-4 text-center">
              <h1 className="text-h2-sm font-semibold text-neutral-50 sm:text-h2">
                Let&apos;s Get Started
              </h1>
              <p className="mt-2 text-subtext text-neutral-200">
                Select your current stage
              </p>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3 lg:gap-5">
              {stageCards.map((card) => {
                const Icon = card.icon;
                const isSelected = selectedStage === card.id;

                return (
                  <button
                    key={card.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedStage(card.id)}
                    className={`flex min-h-34 flex-col items-center justify-center rounded-3xl border px-5 py-6 text-center transition-all duration-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200 ${
                      isSelected
                        ? "border-primary-200 bg-primary-500/20 shadow-[0_0_20px_rgba(112,181,223,0.18)]"
                        : "border-transparent bg-neutral-700/75 hover:border-primary-300/40 hover:bg-neutral-600/80"
                    }`}
                  >
                    <Icon
                      aria-hidden="true"
                      className="h-12 w-12 text-primary-100"
                    />
                    <h2 className="mt-3 text-xl font-medium text-neutral-50">
                      {card.title}
                    </h2>
                    <p className="mt-1 max-w-48 text-sm leading-5 text-neutral-200">
                      {card.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex items-center justify-end">
              <Button
                className="h-11 min-w-23 rounded-[0.7rem] bg-action-primary px-4 text-base font-semibold text-on-action hover:bg-action-primary-hover"
                intent="primary"
                onClick={() => setCurrentStep("account")}
                type="button"
                variant="solid"
                iconRight={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
              >
                Next
              </Button>
            </div>
          </div>

          <p className="mt-4 text-center text-sm text-neutral-200">
            Already Have An Account?{" "}
            <Link
              href="/login"
              className="text-accent-200 transition-colors hover:text-accent-100"
            >
              Login Now
            </Link>
          </p>
        </section>
      )}

      {currentStep === "account" && (
        <section className="w-full max-w-md animate-[fadeInUp_500ms_ease-out]">
          <div className="rounded-4xl border border-primary-300/35 bg-surface/90 px-6 py-8 shadow-[0_0_0_1px_rgba(90,167,214,0.16),0_0_75px_rgba(11,34,54,0.32)] backdrop-blur-2xl sm:px-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary-300/80 bg-primary-400/10 text-primary-300 shadow-[0_0_24px_rgba(58,144,201,0.24)]">
              <UserPlus aria-hidden="true" className="h-8 w-8" />
            </div>

            <div className="mt-4 text-center">
              <h1 className="text-h2-sm font-semibold text-neutral-50 sm:text-h2">
                Create Your Account
              </h1>
              <p className="mt-2 text-subtext text-neutral-200">
                Step 1 of 2 — Account credentials
              </p>
            </div>

            <form
              onSubmit={handleCreateAccount}
              noValidate
              className="mt-6 space-y-3"
            >
              <div>
                <Input
                  id={`${formId}-fullName`}
                  label="Full Name"
                  name="fullName"
                  autoComplete="name"
                  placeholder="Enter your full name"
                  type="text"
                  value={fullName}
                  onChange={(event) => {
                    setFullName(event.target.value);
                    setFieldErrors((prev) => ({
                      ...prev,
                      fullName: undefined,
                    }));
                    setFormError("");
                  }}
                  error={fieldErrors.fullName}
                  aria-describedby={
                    fieldErrors.fullName ? `${formId}-fullName-error` : undefined
                  }
                  required
                />
                {fieldErrors.fullName && (
                  <p
                    id={`${formId}-fullName-error`}
                    className="mt-1 text-xs text-danger-300"
                  >
                    {fieldErrors.fullName}
                  </p>
                )}
              </div>

              <div>
                <Input
                  id={`${formId}-email`}
                  label="Email"
                  name="email"
                  autoComplete="email"
                  placeholder="Enter your email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    setFormError("");
                  }}
                  error={fieldErrors.email}
                  aria-describedby={
                    fieldErrors.email ? `${formId}-email-error` : undefined
                  }
                  required
                />
                {fieldErrors.email && (
                  <p
                    id={`${formId}-email-error`}
                    className="mt-1 text-xs text-danger-300"
                  >
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div>
                <Input
                  id={`${formId}-password`}
                  label="Password"
                  name="password"
                  autoComplete="new-password"
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFieldErrors((prev) => ({
                      ...prev,
                      password: undefined,
                    }));
                    setFormError("");
                  }}
                  error={fieldErrors.password}
                  aria-describedby={
                    fieldErrors.password
                      ? `${formId}-password-error`
                      : undefined
                  }
                  required
                />
                {fieldErrors.password && (
                  <p
                    id={`${formId}-password-error`}
                    className="mt-1 text-xs text-danger-300"
                  >
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <div>
                <Input
                  id={`${formId}-confirmPassword`}
                  label="Confirm Password"
                  name="confirmPassword"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setFieldErrors((prev) => ({
                      ...prev,
                      confirmPassword: undefined,
                    }));
                    setFormError("");
                  }}
                  error={fieldErrors.confirmPassword}
                  aria-describedby={
                    fieldErrors.confirmPassword
                      ? `${formId}-confirmPassword-error`
                      : undefined
                  }
                  required
                />
                {fieldErrors.confirmPassword && (
                  <p
                    id={`${formId}-confirmPassword-error`}
                    className="mt-1 text-xs text-danger-300"
                  >
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>

              {formError && (
                <p
                  role="alert"
                  className="rounded-xl border border-danger-400/50 bg-danger-800/20 px-3 py-2 text-center text-sm text-danger-300"
                >
                  {formError}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  className="h-11 min-w-19 rounded-[0.7rem] border border-primary-300/80 bg-transparent px-4 text-base font-medium text-primary-100 hover:bg-primary-400/10"
                  intent="primary"
                  onClick={() => setCurrentStep("stage")}
                  type="button"
                  variant="outlined"
                  disabled={isSubmitting}
                >
                  Back
                </Button>
                <Button
                  className="h-11 flex-1 rounded-[0.7rem] bg-action-accent px-4 text-base font-semibold text-on-action hover:bg-action-accent-hover"
                  intent="primary"
                  type="submit"
                  variant="solid"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2
                        aria-hidden="true"
                        className="size-4 motion-safe:animate-spin"
                      />
                      Creating Account…
                    </span>
                  ) : (
                    "Create My Account"
                  )}
                </Button>
              </div>
            </form>
          </div>

          <p className="mt-4 text-center text-sm text-neutral-200">
            Already Have An Account?{" "}
            <Link
              href="/login"
              className="text-accent-200 transition-colors hover:text-accent-100"
            >
              Login Now
            </Link>
          </p>
        </section>
      )}

      {currentStep === "complete-profile" && (
        <section className="w-full max-w-3xl animate-[fadeInUp_500ms_ease-out]">
          <div className="rounded-4xl border border-primary-300/35 bg-surface/90 px-6 py-8 shadow-[0_0_0_1px_rgba(90,167,214,0.16),0_0_75px_rgba(11,34,54,0.32)] backdrop-blur-2xl sm:px-8">
            <div className="mb-6 flex items-start gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-accent-400/80 bg-accent-400/10 text-accent-300">
                <UserRoundCheck aria-hidden="true" className="size-6" />
              </span>
              <div>
                <h1 className="text-h2-sm font-semibold text-neutral-50 sm:text-h2">
                  Complete Your Profile
                </h1>
                <p className="mt-1 text-sm text-neutral-200">
                  Step 2 of 2 — Your account is created! Add your profile
                  details now, or choose Finish Later and complete it anytime on
                  your Profile page.
                </p>
              </div>
            </div>

            <ProfileForm
              mode="create"
              fallbackName={fullName}
              onSubmitCreate={createMyProfile}
              onSuccess={handleProfileCreated}
              onSkip={() => router.replace("/profile")}
              onConflictRecover={() => router.replace("/profile")}
              submitLabel="Complete Profile"
            />
          </div>
        </section>
      )}

      {currentStep === "success" && (
        <section className="w-full max-w-md animate-[fadeInUp_500ms_ease-out]">
          <div className="rounded-4xl border border-primary-300/35 bg-surface/90 px-6 py-10 text-center shadow-[0_0_0_1px_rgba(90,167,214,0.16),0_0_75px_rgba(11,34,54,0.32)] backdrop-blur-2xl sm:px-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent-400/80 bg-accent-400/10 text-accent-200 shadow-[0_0_24px_rgba(55,181,170,0.18)]">
              <CheckCircle2 aria-hidden="true" className="h-8 w-8" />
            </div>

            <h1 className="mt-6 text-h2-sm font-semibold text-primary-100 sm:text-h2">
              Your Profile Is Ready!
            </h1>
            <p className="mt-2 text-subtext text-neutral-200">
              Dive in and explore researchers, papers, publications, and careers.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/profile"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-action-accent px-5 text-sm font-semibold text-on-action transition-colors hover:bg-action-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200"
              >
                View My Profile
              </Link>
              <Link
                href="/"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-primary-300/80 px-5 text-sm font-semibold text-primary-100 transition-colors hover:bg-primary-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200"
              >
                Explore NEXUS
              </Link>
            </div>
          </div>
        </section>
      )}
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <div className="h-96 w-full max-w-md rounded-4xl border border-primary-300/30 bg-surface/60 motion-safe:animate-pulse" />
        </AuthShell>
      }
    >
      <SignupFlowContent />
    </Suspense>
  );
}
