"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  AlertCircle,
  BookOpen,
  Briefcase,
  Building2,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  LogOut,
  MapPin,
  Pencil,
  RefreshCw,
  Trash2,
  UserRoundPlus,
} from "lucide-react";
import Badge from "@/src/components/ui/Badge/Badge";
import Button from "@/src/components/ui/Button/Button";
import { useAuth } from "@/src/features/auth/AuthContext";
import { userAvatarTone, userInitials } from "@/src/features/auth/auth.utils";
import {
  createMyProfile,
  deleteMyProfile,
  fetchMyProfile,
  updateMyProfile,
} from "../profile.api";
import type { UserProfile } from "../profile.type";
import DeleteProfileModal from "./DeleteProfileModal";
import ProfileForm from "./ProfileForm";

export default function ProfilePageClient() {
  const router = useRouter();
  const { status, user, refreshSession, updateDisplayName, signOut } =
    useAuth();

  const [retryCount, setRetryCount] = useState(0);
  const requestKey = `${user?.id ?? ""}:${retryCount}`;
  const [profileResult, setProfileResult] = useState<{
    key: string;
    profile: UserProfile | null;
    error: string | null;
  }>();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Redirect unauthenticated visitors to login with a safe returnTo
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?returnTo=%2Fprofile");
    }
  }, [status, router]);

  // Fetch profile once authenticated
  useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();

    fetchMyProfile(controller.signal)
      .then((profile) => {
        if (!controller.signal.aborted) {
          setProfileResult({ key: requestKey, profile, error: null });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && !axios.isCancel(cause)) {
          setProfileResult({
            key: requestKey,
            profile: null,
            error:
              cause instanceof Error
                ? cause.message
                : "Could not load your profile.",
          });
        }
      });

    return () => controller.abort();
  }, [status, requestKey]);

  const profileLoading =
    status === "authenticated" && profileResult?.key !== requestKey;
  const profileError =
    profileResult?.key === requestKey ? profileResult.error : null;
  const profile =
    profileResult?.key === requestKey ? profileResult.profile : null;

  const handleProfileSaved = useCallback(
    (saved: UserProfile) => {
      setProfileResult({ key: requestKey, profile: saved, error: null });
      const combinedName = `${saved.firstName} ${saved.lastName}`.trim();
      if (combinedName) updateDisplayName(combinedName);
      setIsEditing(false);
      setBanner("Your profile has been saved.");
    },
    [requestKey, updateDisplayName],
  );

  const handleDeleteConfirm = useCallback(async () => {
    const targetId = profile?.userId || user?.id;
    if (!targetId) throw new Error("Unable to determine your profile ID.");
    await deleteMyProfile(targetId);
    setProfileResult({ key: requestKey, profile: null, error: null });
    setIsEditing(false);
    setBanner(
      "Your profile details were deleted. Your login account and session remain active—you can create a new profile below or sign out.",
    );
  }, [profile?.userId, user?.id, requestKey]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      router.push("/");
    } catch {
      setIsSigningOut(false);
    }
  };

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div
        aria-busy="true"
        aria-label="Loading profile"
        className="mx-auto w-full max-w-4xl space-y-6"
      >
        <div className="h-36 rounded-3xl border border-neutral-600/60 bg-overlay/10 motion-safe:animate-pulse" />
        <div className="h-64 rounded-3xl border border-neutral-600/60 bg-overlay/10 motion-safe:animate-pulse" />
      </div>
    );
  }

  if (status === "unknown") {
    return (
      <section
        role="alert"
        className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-3xl border border-danger-400/50 bg-surface/90 p-8 text-center"
      >
        <AlertCircle aria-hidden="true" className="size-10 text-danger-300" />
        <h1 className="text-2xl font-semibold text-neutral-50">
          Unable to reach the server
        </h1>
        <p className="text-sm text-neutral-200">
          We couldn&apos;t verify your session right now. Check your connection
          and try again.
        </p>
        <Button
          type="button"
          variant="outlined"
          intent="accent"
          onClick={() => void refreshSession()}
          iconLeft={<RefreshCw aria-hidden="true" className="size-4" />}
        >
          Retry
        </Button>
      </section>
    );
  }

  const fullName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : user?.name?.trim() || user?.email || "Your Account";
  const initials = userInitials(fullName, user?.email);
  const avatarToneClass = userAvatarTone(user?.id || user?.email || fullName);

  const locationText = [profile?.governorate, profile?.country]
    .filter(Boolean)
    .join(", ");
  const academicText = [
    profile?.department,
    profile?.faculty,
    profile?.university,
  ]
    .filter(Boolean)
    .join(" · ");

  const externalLinks = [
    profile?.linkedinUrl
      ? { label: "LinkedIn", href: profile.linkedinUrl }
      : null,
    profile?.githubUrl ? { label: "GitHub", href: profile.githubUrl } : null,
    profile?.scholarUrl
      ? { label: "Google Scholar", href: profile.scholarUrl }
      : null,
  ].filter((item): item is { label: string; href: string } => Boolean(item));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      {banner && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent-400/60 bg-accent-700/20 px-4 py-3 text-sm text-accent-200"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
            <span>{banner}</span>
          </span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs font-semibold underline underline-offset-2 hover:text-accent-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Account Summary Header */}
      <section className="rounded-3xl border border-primary-300/40 bg-surface/90 p-6 backdrop-blur-xl sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className={`flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-on-action shadow-sm ${avatarToneClass}`}
            >
              {initials}
            </span>
            <div className="min-w-0">
              <h1 className="wrap-break-word text-2xl font-bold text-neutral-50 sm:text-3xl">
                {fullName}
              </h1>
              {user?.email && (
                <p className="mt-0.5 truncate text-sm text-neutral-200">
                  {user.email}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {user?.role && (
                  <Badge variant="outlined" intent="accent" size="sm">
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </Badge>
                )}
                {locationText && (
                  <span className="inline-flex items-center gap-1 text-xs text-neutral-200">
                    <MapPin
                      aria-hidden="true"
                      className="size-3.5 text-accent-300"
                    />
                    {locationText}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {profile && !isEditing && (
              <Button
                type="button"
                variant="outlined"
                intent="accent"
                className="min-h-11 rounded-xl"
                iconLeft={<Pencil aria-hidden="true" className="size-4" />}
                onClick={() => {
                  setBanner(null);
                  setIsEditing(true);
                }}
              >
                Edit Profile
              </Button>
            )}
            <Button
              type="button"
              variant="outlined"
              intent="primary"
              disabled={isSigningOut}
              className="min-h-11 rounded-xl"
              iconLeft={<LogOut aria-hidden="true" className="size-4" />}
              onClick={handleSignOut}
            >
              {isSigningOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </div>
      </section>

      {/* Profile Content States */}
      {profileLoading ? (
        <div
          aria-busy="true"
          className="h-64 rounded-3xl border border-neutral-600/60 bg-overlay/10 motion-safe:animate-pulse"
        />
      ) : profileError ? (
        <section
          role="alert"
          className="flex flex-col items-center gap-3 rounded-3xl border border-danger-400/50 bg-surface/90 p-8 text-center"
        >
          <AlertCircle aria-hidden="true" className="size-8 text-danger-300" />
          <h2 className="text-xl font-semibold text-danger-300">
            Couldn&apos;t load your profile
          </h2>
          <p className="max-w-md text-sm text-neutral-200">{profileError}</p>
          <Button
            type="button"
            variant="outlined"
            intent="accent"
            onClick={() => setRetryCount((c) => c + 1)}
          >
            Try Again
          </Button>
        </section>
      ) : !profile ? (
        /* No profile yet (e.g. first-time social login, skipped signup step, or post-delete) */
        <section className="rounded-3xl border border-primary-300/40 bg-surface/90 p-6 backdrop-blur-xl sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-accent-400/50 bg-accent-700/20 text-accent-300">
              <UserRoundPlus aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-neutral-50">
                Complete Your Profile
              </h2>
              <p className="mt-1 text-sm text-neutral-200">
                You don&apos;t have a profile yet. Add your academic background,
                links, and skills below.
              </p>
            </div>
          </div>

          <ProfileForm
            mode="create"
            fallbackName={user?.name}
            onSubmitCreate={createMyProfile}
            onSuccess={handleProfileSaved}
            onConflictRecover={() => setRetryCount((c) => c + 1)}
            submitLabel="Create Profile"
          />
        </section>
      ) : isEditing ? (
        /* Edit Profile Form */
        <section className="rounded-3xl border border-primary-300/40 bg-surface/90 p-6 backdrop-blur-xl sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-neutral-50">Edit Profile</h2>
            <p className="mt-1 text-sm text-neutral-200">
              Only fields you modify will be updated.
            </p>
          </div>

          <ProfileForm
            mode="edit"
            initialProfile={profile}
            onSubmitEdit={updateMyProfile}
            onSuccess={handleProfileSaved}
            onCancel={() => setIsEditing(false)}
            submitLabel="Save Changes"
          />
        </section>
      ) : (
        /* Profile Details Read View */
        <div className="space-y-6">
          <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Academic & Personal Details */}
            <div className="rounded-3xl border border-neutral-500/60 bg-surface/90 p-6">
              <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-neutral-50">
                <GraduationCap
                  aria-hidden="true"
                  className="size-5 text-accent-300"
                />
                Academic &amp; Personal Details
              </h2>
              <dl className="space-y-3 text-sm">
                {profile.university && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs font-medium text-neutral-300 uppercase">
                      University
                    </dt>
                    <dd className="wrap-break-word text-neutral-50">
                      {profile.university}
                    </dd>
                  </div>
                )}
                {profile.faculty && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs font-medium text-neutral-300 uppercase">
                      Faculty
                    </dt>
                    <dd className="wrap-break-word text-neutral-50">
                      {profile.faculty}
                    </dd>
                  </div>
                )}
                {profile.department && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs font-medium text-neutral-300 uppercase">
                      Department
                    </dt>
                    <dd className="wrap-break-word text-neutral-50">
                      {profile.department}
                    </dd>
                  </div>
                )}
                {profile.graduationYear !== null && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs font-medium text-neutral-300 uppercase">
                      Graduation Year
                    </dt>
                    <dd className="text-neutral-50">
                      {profile.graduationYear}
                    </dd>
                  </div>
                )}
                {profile.gender && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs font-medium text-neutral-300 uppercase">
                      Gender
                    </dt>
                    <dd className="capitalize text-neutral-50">
                      {profile.gender}
                    </dd>
                  </div>
                )}
                {!academicText &&
                  profile.graduationYear === null &&
                  !profile.gender && (
                    <p className="text-neutral-300">
                      No additional academic details added yet.
                    </p>
                  )}
              </dl>
            </div>

            {/* Links & Skills */}
            <div className="flex flex-col gap-6">
              {profile.skills.length > 0 && (
                <div className="rounded-3xl border border-neutral-500/60 bg-surface/90 p-6">
                  <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-neutral-50">
                    <BookOpen
                      aria-hidden="true"
                      className="size-5 text-accent-300"
                    />
                    Skills
                  </h2>
                  <ul className="flex flex-wrap gap-2">
                    {profile.skills.map((skill) => (
                      <li key={skill}>
                        <Badge variant="outlined" intent="primary" size="sm">
                          {skill}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {externalLinks.length > 0 && (
                <div className="rounded-3xl border border-neutral-500/60 bg-surface/90 p-6">
                  <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-neutral-50">
                    <Building2
                      aria-hidden="true"
                      className="size-5 text-accent-300"
                    />
                    Profiles &amp; Links
                  </h2>
                  <ul className="flex flex-wrap gap-2.5">
                    {externalLinks.map((link) => (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-primary-300/60 bg-overlay/5 px-3.5 py-2 text-sm font-medium text-primary-200 transition-colors hover:border-accent-400 hover:text-accent-200 focus-visible:outline-2 focus-visible:outline-accent-200"
                        >
                          <span>{link.label}</span>
                          <ExternalLink aria-hidden="true" className="size-3.5" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {profile.experience && (
            <section className="rounded-3xl border border-neutral-500/60 bg-surface/90 p-6">
              <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-neutral-50">
                <Briefcase
                  aria-hidden="true"
                  className="size-5 text-accent-300"
                />
                Experience
              </h2>
              <p className="whitespace-pre-line wrap-break-word text-sm leading-relaxed text-neutral-100">
                {profile.experience}
              </p>
            </section>
          )}

          {/* Danger Zone: Delete Profile */}
          <section className="flex flex-col justify-between gap-4 rounded-3xl border border-danger-400/40 bg-danger-800/10 p-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-bold text-danger-300">
                Delete Profile
              </h2>
              <p className="mt-1 text-sm text-neutral-200">
                Permanently remove your saved profile details. Your login
                account will remain active.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsDeleteOpen(true)}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-danger-400/70 bg-danger-800/20 px-4 text-sm font-semibold text-danger-200 transition-colors hover:bg-danger-800/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger-300 cursor-pointer"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Delete Profile
            </button>
          </section>
        </div>
      )}

      <DeleteProfileModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
