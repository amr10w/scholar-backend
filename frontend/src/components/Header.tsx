"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, User, X } from "lucide-react";
import { useAuth } from "@/src/features/auth/AuthContext";
import { userAvatarTone, userInitials } from "@/src/features/auth/auth.utils";
import LogoIcon from "./Icons/Logo";
import ThemeToggle from "./ui/ThemeToggle/ThemeToggle";
import Button from "./ui/Button/Button";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Research", href: "/research" },
  { label: "Tools", href: "/tools" },
  { label: "Jobs", href: "/jobs" },
  { label: "About", href: "/about" },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { status, user, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const userMenuId = useId();

  useEffect(() => {
    if (!isUserMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsUserMenuOpen(false);
        userMenuTriggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isUserMenuOpen]);

  const handleSignOut = async () => {
    setSignOutError(null);
    setIsSigningOut(true);
    try {
      await signOut();
      setIsUserMenuOpen(false);
      setIsMenuOpen(false);
      router.push("/");
    } catch (cause) {
      setSignOutError(
        cause instanceof Error
          ? cause.message
          : "Could not sign out. Please try again.",
      );
    } finally {
      setIsSigningOut(false);
    }
  };

  const displayName = user?.name?.trim() || user?.email || "Account";
  const initials = userInitials(user?.name, user?.email);
  const avatarToneClass = userAvatarTone(user?.id || user?.email || displayName);

  const renderAuthControl = () => {
    // Neutral same-size placeholder while session hydrates: prevents Login flash & CLS
    if (status === "loading") {
      return (
        <div
          aria-hidden="true"
          data-testid="header-auth-loading"
          className="h-13.5 min-w-24 w-full rounded-xl border border-neutral-600/50 bg-overlay/10 motion-safe:animate-pulse lg:w-28"
        />
      );
    }

    if (status === "authenticated" && user) {
      return (
        <div ref={userMenuRef} className="relative w-full lg:w-auto">
          {/* Desktop Dropdown Trigger */}
          <button
            ref={userMenuTriggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={isUserMenuOpen}
            aria-controls={isUserMenuOpen ? userMenuId : undefined}
            onClick={() => {
              setSignOutError(null);
              setIsUserMenuOpen((prev) => !prev);
            }}
            className="hidden h-13.5 max-w-52 items-center gap-2.5 rounded-xl border border-primary-300/60 bg-overlay/5 px-3 text-sm font-medium text-neutral-50 transition-colors hover:border-accent-400 hover:bg-overlay/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200 cursor-pointer lg:inline-flex"
          >
            <span
              aria-hidden="true"
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-on-action ${avatarToneClass}`}
            >
              {initials}
            </span>
            <span className="truncate">{displayName}</span>
            <ChevronDown
              aria-hidden="true"
              className={`size-4 shrink-0 text-neutral-300 transition-transform ${isUserMenuOpen ? "rotate-180" : ""}`}
            />
          </button>

          {/* Desktop Dropdown Panel */}
          {isUserMenuOpen && (
            <div
              id={userMenuId}
              role="menu"
              aria-label="Account menu"
              className="absolute right-0 top-full z-50 mt-2 hidden w-60 rounded-2xl border border-neutral-500/80 bg-surface p-2 shadow-2xl lg:block"
            >
              <div className="border-b border-neutral-600/60 px-3 py-2.5">
                <p className="truncate text-sm font-semibold text-neutral-50">
                  {displayName}
                </p>
                {user.email && (
                  <p className="truncate text-xs text-neutral-300">
                    {user.email}
                  </p>
                )}
              </div>

              <div className="mt-1 flex flex-col gap-1">
                <Link
                  role="menuitem"
                  href="/profile"
                  onClick={() => setIsUserMenuOpen(false)}
                  className="flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-neutral-100 transition-colors hover:bg-overlay/10 hover:text-neutral-50 focus-visible:outline-2 focus-visible:outline-accent-200"
                >
                  <User aria-hidden="true" className="size-4 text-accent-300" />
                  <span>Profile</span>
                </Link>

                <button
                  role="menuitem"
                  type="button"
                  disabled={isSigningOut}
                  onClick={handleSignOut}
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-danger-300 transition-colors hover:bg-danger-800/20 focus-visible:outline-2 focus-visible:outline-accent-200 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  <LogOut aria-hidden="true" className="size-4" />
                  <span>{isSigningOut ? "Signing out…" : "Sign out"}</span>
                </button>
              </div>

              {signOutError && (
                <p
                  role="alert"
                  className="mt-2 rounded-lg border border-danger-400/50 bg-danger-800/20 px-2.5 py-1.5 text-xs text-danger-300"
                >
                  {signOutError}
                </p>
              )}
            </div>
          )}

          {/* Mobile Signed-In Account Controls */}
          <div className="flex flex-col gap-2 lg:hidden">
            <div className="flex items-center gap-3 rounded-xl border border-neutral-600/60 bg-overlay/5 px-3 py-2.5">
              <span
                aria-hidden="true"
                className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-on-action ${avatarToneClass}`}
              >
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-50">
                  {displayName}
                </p>
                {user.email && (
                  <p className="truncate text-xs text-neutral-300">
                    {user.email}
                  </p>
                )}
              </div>
            </div>

            <Link
              href="/profile"
              onClick={() => setIsMenuOpen(false)}
              className="flex min-h-11 items-center gap-2.5 rounded-xl border border-primary-300/60 px-4 py-2 text-sm font-medium text-neutral-100 transition-colors hover:border-accent-400 hover:bg-overlay/10 focus-visible:outline-2 focus-visible:outline-accent-200"
            >
              <User aria-hidden="true" className="size-4 text-accent-300" />
              <span>Profile</span>
            </Link>

            <button
              type="button"
              disabled={isSigningOut}
              onClick={handleSignOut}
              className="flex min-h-11 items-center gap-2.5 rounded-xl border border-danger-400/50 px-4 py-2 text-left text-sm font-medium text-danger-300 transition-colors hover:bg-danger-800/20 focus-visible:outline-2 focus-visible:outline-accent-200 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              <LogOut aria-hidden="true" className="size-4" />
              <span>{isSigningOut ? "Signing out…" : "Sign out"}</span>
            </button>

            {signOutError && (
              <p
                role="alert"
                className="rounded-lg border border-danger-400/50 bg-danger-800/20 px-3 py-2 text-xs text-danger-300"
              >
                {signOutError}
              </p>
            )}
          </div>
        </div>
      );
    }

    return (
      <Button
        aria-label="Log in"
        className="h-13.5 min-w-24 w-full lg:w-auto flex justify-center"
        intent="primary"
        variant="outlined"
        onClick={() => {
          setIsMenuOpen(false);
          router.push("/login");
        }}
      >
        Login
      </Button>
    );
  };

  return (
    <header className="fixed top-0 left-0 z-50 flex min-h-21.5 w-full flex-col bg-neutral-900/95 lg:bg-neutral-900/50 px-6 py-6 backdrop-blur-[7.5px] sm:px-10 lg:h-21.5 lg:flex-row lg:items-center lg:justify-between lg:px-26 lg:py-3.5 overflow-visible">
      <div className="flex w-full items-center justify-between lg:w-max">
        <Link
          aria-label="NEXUS home"
          className="flex h-12.5 shrink-0 items-center gap-2.5 text-primary-300"
          href="/"
          onClick={() => setIsMenuOpen(false)}
        >
          <LogoIcon />
        </Link>

        {/* Mobile controls (Theme + Hamburger) */}
        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle className="flex h-12.5 w-12.5" />
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={isMenuOpen}
            className="flex h-12.5 w-12.5 items-center justify-center rounded-xl text-neutral-300 transition-colors duration-200 hover:text-neutral-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-100"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? (
              <X aria-hidden="true" className="h-8 w-8" />
            ) : (
              <Menu aria-hidden="true" className="h-8 w-8" />
            )}
          </button>
        </div>
      </div>

      {/* Navigation and Actions */}
      <div
        className={`${
          isMenuOpen ? "flex" : "hidden"
        } mt-4 flex-col gap-4 lg:mt-0 lg:flex lg:flex-row lg:items-center lg:justify-between lg:gap-2.5 lg:flex-1 lg:pl-10`}
      >
        <nav
          aria-label="Primary navigation"
          className="flex w-full flex-col lg:w-auto lg:flex-row lg:items-center lg:mx-auto"
        >
          <ul className="flex flex-col gap-2 lg:flex-row lg:gap-6.5">
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === item.href
                  : pathname.startsWith(item.href);

              const navLinkClassName =
                `relative isolate flex h-12.5 items-center justify-start lg:justify-center overflow-visible rounded-xl px-4 lg:px-2.5 font-main tracking-display capitalize transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300 ${
                  isActive
                    ? "text-h3-sm text-neutral-50 bg-neutral-800/50 lg:bg-transparent"
                    : "text-btn text-neutral-100 hover:text-neutral-50 hover:bg-neutral-800/30 lg:hover:bg-transparent"
                }`.trim();

              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={navLinkClassName}
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {isActive ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-1/2 top-1/2 z-0 hidden h-8 w-15.75 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-400 blur-[50px] lg:block"
                      />
                    ) : null}
                    <span className="relative z-10">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Desktop actions and mobile account controls */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-2.5 lg:min-w-45 lg:justify-end border-t border-neutral-800 pt-4 lg:border-t-0 lg:pt-0">
          {renderAuthControl()}
          <ThemeToggle className="hidden h-13.5 w-13.5 lg:flex" />
        </div>
      </div>
    </header>
  );
}
