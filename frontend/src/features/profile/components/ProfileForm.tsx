"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import Button from "@/src/components/ui/Button/Button";
import { Input } from "@/src/components/ui/InputField/Input";
import {
  GENDER_OPTIONS,
  MAX_GRADUATION_YEAR,
  MIN_GRADUATION_YEAR,
  diffProfileChanges,
  formValuesToCreateInput,
  profileToFormValues,
  validateProfileForm,
} from "../profile.schema";
import { ProfileApiError } from "../profile.api";
import type {
  CreateProfileInput,
  ProfileFormValues,
  UpdateProfileInput,
  UserProfile,
} from "../profile.type";

interface ProfileFormProps {
  mode: "create" | "edit";
  initialProfile?: UserProfile | null;
  fallbackName?: string | null;
  onSubmitCreate?: (input: CreateProfileInput) => Promise<UserProfile>;
  onSubmitEdit?: (changes: UpdateProfileInput) => Promise<UserProfile>;
  onSuccess: (profile: UserProfile) => void;
  onCancel?: () => void;
  onSkip?: () => void;
  onConflictRecover?: () => void;
  submitLabel?: string;
}

export default function ProfileForm({
  mode,
  initialProfile = null,
  fallbackName = null,
  onSubmitCreate,
  onSubmitEdit,
  onSuccess,
  onCancel,
  onSkip,
  onConflictRecover,
  submitLabel,
}: ProfileFormProps) {
  const formId = useId();
  const [values, setValues] = useState<ProfileFormValues>(() =>
    profileToFormValues(initialProfile, fallbackName),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictDetected, setConflictDetected] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pendingChanges = useMemo(() => {
    if (mode !== "edit" || !initialProfile) return null;
    return diffProfileChanges(initialProfile, values);
  }, [mode, initialProfile, values]);

  const hasChanges =
    mode === "create" ||
    Boolean(pendingChanges && Object.keys(pendingChanges).length > 0);

  const setField = (key: keyof ProfileFormValues, next: string) => {
    setValues((prev) => ({ ...prev, [key]: next }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    setFormError(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const validation = validateProfileForm(values);
    if (!validation.success) {
      setFieldErrors(validation.fieldErrors);
      setFormError("Please fix the highlighted fields before continuing.");
      return;
    }

    if (mode === "edit" && (!pendingChanges || Object.keys(pendingChanges).length === 0)) {
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setConflictDetected(false);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      let saved: UserProfile;
      if (mode === "create") {
        if (!onSubmitCreate) throw new Error("Missing create handler.");
        saved = await onSubmitCreate(formValuesToCreateInput(values));
      } else {
        if (!onSubmitEdit || !pendingChanges) {
          throw new Error("Missing edit handler.");
        }
        saved = await onSubmitEdit(pendingChanges);
        setSuccessMessage("Profile updated successfully.");
      }
      onSuccess(saved);
    } catch (cause) {
      if (cause instanceof ProfileApiError) {
        if (cause.fieldErrors) setFieldErrors(cause.fieldErrors);
        if (cause.kind === "conflict") {
          setConflictDetected(true);
        }
        setFormError(cause.message);
      } else {
        setFormError(
          cause instanceof Error
            ? cause.message
            : "Could not save your profile. Please try again.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldId = (name: string) => `${formId}-${name}`;
  const errorId = (name: string) => `${formId}-${name}-error`;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {formError && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-2xl border border-danger-400/60 bg-danger-800/20 px-4 py-3 text-sm text-danger-200"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-danger-300"
            />
            <span>{formError}</span>
          </div>
          {conflictDetected && onConflictRecover && (
            <button
              type="button"
              onClick={onConflictRecover}
              className="self-start text-xs font-semibold text-accent-200 underline underline-offset-2 hover:text-accent-100 cursor-pointer"
            >
              View existing profile
            </button>
          )}
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-2xl border border-accent-400/60 bg-accent-700/20 px-4 py-3 text-sm text-accent-200"
        >
          <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Personal Information */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold tracking-wide text-primary-200 uppercase">
          Personal Information
        </legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Input
              id={fieldId("firstName")}
              name="firstName"
              label="First Name *"
              autoComplete="given-name"
              placeholder="e.g. Ahmed"
              value={values.firstName}
              onChange={(e) => setField("firstName", e.target.value)}
              error={fieldErrors.firstName}
              aria-describedby={
                fieldErrors.firstName ? errorId("firstName") : undefined
              }
              required
            />
            {fieldErrors.firstName && (
              <p
                id={errorId("firstName")}
                className="mt-1 text-xs text-danger-300"
              >
                {fieldErrors.firstName}
              </p>
            )}
          </div>

          <div>
            <Input
              id={fieldId("lastName")}
              name="lastName"
              label="Last Name *"
              autoComplete="family-name"
              placeholder="e.g. Mohamed"
              value={values.lastName}
              onChange={(e) => setField("lastName", e.target.value)}
              error={fieldErrors.lastName}
              aria-describedby={
                fieldErrors.lastName ? errorId("lastName") : undefined
              }
              required
            />
            {fieldErrors.lastName && (
              <p
                id={errorId("lastName")}
                className="mt-1 text-xs text-danger-300"
              >
                {fieldErrors.lastName}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor={fieldId("gender")}
              className="mb-1.5 block text-xs font-medium text-neutral-200"
            >
              Gender
            </label>
            <select
              id={fieldId("gender")}
              name="gender"
              value={values.gender}
              onChange={(e) => setField("gender", e.target.value)}
              className="h-12 w-full rounded-xl border border-neutral-500/80 bg-neutral-800/70 px-3 text-sm text-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-200"
            >
              {GENDER_OPTIONS.map((opt) => (
                <option key={opt.value || "none"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Input
              id={fieldId("country")}
              name="country"
              label="Country"
              autoComplete="country-name"
              placeholder="e.g. Egypt"
              value={values.country}
              onChange={(e) => setField("country", e.target.value)}
              error={fieldErrors.country}
              aria-describedby={
                fieldErrors.country ? errorId("country") : undefined
              }
            />
            {fieldErrors.country && (
              <p id={errorId("country")} className="mt-1 text-xs text-danger-300">
                {fieldErrors.country}
              </p>
            )}
          </div>

          <div>
            <Input
              id={fieldId("governorate")}
              name="governorate"
              label="Governorate / City"
              placeholder="e.g. Cairo"
              value={values.governorate}
              onChange={(e) => setField("governorate", e.target.value)}
              error={fieldErrors.governorate}
              aria-describedby={
                fieldErrors.governorate ? errorId("governorate") : undefined
              }
            />
            {fieldErrors.governorate && (
              <p
                id={errorId("governorate")}
                className="mt-1 text-xs text-danger-300"
              >
                {fieldErrors.governorate}
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {/* Academic Background */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold tracking-wide text-primary-200 uppercase">
          Academic Background
        </legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Input
              id={fieldId("university")}
              name="university"
              label="University"
              placeholder="e.g. Cairo University"
              value={values.university}
              onChange={(e) => setField("university", e.target.value)}
              error={fieldErrors.university}
            />
            {fieldErrors.university && (
              <p className="mt-1 text-xs text-danger-300">
                {fieldErrors.university}
              </p>
            )}
          </div>

          <div>
            <Input
              id={fieldId("faculty")}
              name="faculty"
              label="Faculty"
              placeholder="e.g. Faculty of Engineering"
              value={values.faculty}
              onChange={(e) => setField("faculty", e.target.value)}
              error={fieldErrors.faculty}
            />
            {fieldErrors.faculty && (
              <p className="mt-1 text-xs text-danger-300">
                {fieldErrors.faculty}
              </p>
            )}
          </div>

          <div>
            <Input
              id={fieldId("department")}
              name="department"
              label="Department"
              placeholder="e.g. Electronics & Communications"
              value={values.department}
              onChange={(e) => setField("department", e.target.value)}
              error={fieldErrors.department}
            />
            {fieldErrors.department && (
              <p className="mt-1 text-xs text-danger-300">
                {fieldErrors.department}
              </p>
            )}
          </div>

          <div>
            <Input
              id={fieldId("graduationYear")}
              name="graduationYear"
              label="Graduation Year"
              type="text"
              inputMode="numeric"
              placeholder={`${MIN_GRADUATION_YEAR}–${MAX_GRADUATION_YEAR}`}
              value={values.graduationYear}
              onChange={(e) => setField("graduationYear", e.target.value)}
              error={fieldErrors.graduationYear}
              aria-describedby={
                fieldErrors.graduationYear
                  ? errorId("graduationYear")
                  : undefined
              }
            />
            {fieldErrors.graduationYear && (
              <p
                id={errorId("graduationYear")}
                className="mt-1 text-xs text-danger-300"
              >
                {fieldErrors.graduationYear}
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {/* Links, Skills & Experience */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold tracking-wide text-primary-200 uppercase">
          Links, Skills &amp; Experience
        </legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Input
              id={fieldId("linkedinUrl")}
              name="linkedinUrl"
              label="LinkedIn URL"
              type="url"
              placeholder="https://linkedin.com/in/..."
              value={values.linkedinUrl}
              onChange={(e) => setField("linkedinUrl", e.target.value)}
              error={fieldErrors.linkedinUrl}
              aria-describedby={
                fieldErrors.linkedinUrl ? errorId("linkedinUrl") : undefined
              }
            />
            {fieldErrors.linkedinUrl && (
              <p
                id={errorId("linkedinUrl")}
                className="mt-1 text-xs text-danger-300"
              >
                {fieldErrors.linkedinUrl}
              </p>
            )}
          </div>

          <div>
            <Input
              id={fieldId("githubUrl")}
              name="githubUrl"
              label="GitHub URL"
              type="url"
              placeholder="https://github.com/..."
              value={values.githubUrl}
              onChange={(e) => setField("githubUrl", e.target.value)}
              error={fieldErrors.githubUrl}
              aria-describedby={
                fieldErrors.githubUrl ? errorId("githubUrl") : undefined
              }
            />
            {fieldErrors.githubUrl && (
              <p
                id={errorId("githubUrl")}
                className="mt-1 text-xs text-danger-300"
              >
                {fieldErrors.githubUrl}
              </p>
            )}
          </div>

          <div>
            <Input
              id={fieldId("scholarUrl")}
              name="scholarUrl"
              label="Google Scholar URL"
              type="url"
              placeholder="https://scholar.google.com/..."
              value={values.scholarUrl}
              onChange={(e) => setField("scholarUrl", e.target.value)}
              error={fieldErrors.scholarUrl}
              aria-describedby={
                fieldErrors.scholarUrl ? errorId("scholarUrl") : undefined
              }
            />
            {fieldErrors.scholarUrl && (
              <p
                id={errorId("scholarUrl")}
                className="mt-1 text-xs text-danger-300"
              >
                {fieldErrors.scholarUrl}
              </p>
            )}
          </div>
        </div>

        <div>
          <Input
            id={fieldId("skillsText")}
            name="skillsText"
            label="Skills (comma-separated)"
            placeholder="e.g. VLSI, SystemVerilog, Python, Next.js"
            value={values.skillsText}
            onChange={(e) => setField("skillsText", e.target.value)}
            error={fieldErrors.skillsText}
          />
          {fieldErrors.skillsText && (
            <p className="mt-1 text-xs text-danger-300">
              {fieldErrors.skillsText}
            </p>
          )}
        </div>

        <div>
          <Input
            id={fieldId("experience")}
            name="experience"
            label="Experience"
            multiline
            rows={3}
            placeholder="Briefly describe your research, internships, or industry roles"
            value={values.experience}
            onChange={(e) => setField("experience", e.target.value)}
            error={fieldErrors.experience}
          />
          {fieldErrors.experience && (
            <p className="mt-1 text-xs text-danger-300">
              {fieldErrors.experience}
            </p>
          )}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-neutral-600/60 pt-4">
        {onSkip && (
          <Button
            type="button"
            variant="outlined"
            intent="primary"
            disabled={isSubmitting}
            onClick={onSkip}
            className="min-h-11 rounded-xl"
          >
            Finish Later
          </Button>
        )}
        {onCancel && (
          <Button
            type="button"
            variant="outlined"
            intent="primary"
            disabled={isSubmitting}
            onClick={onCancel}
            className="min-h-11 rounded-xl"
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="solid"
          intent="accent"
          disabled={isSubmitting || !hasChanges}
          className="min-h-11 rounded-xl bg-action-accent px-5 font-semibold text-on-action hover:bg-action-accent-hover disabled:opacity-50"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2
                aria-hidden="true"
                className="size-4 motion-safe:animate-spin"
              />
              Saving…
            </span>
          ) : (
            (submitLabel ??
            (mode === "create" ? "Save Profile" : "Save Changes"))
          )}
        </Button>
      </div>
    </form>
  );
}
