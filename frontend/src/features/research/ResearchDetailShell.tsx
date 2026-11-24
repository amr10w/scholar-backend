"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Button from "@/src/components/ui/Button/Button";
import { useSwapTransition } from "@/src/hooks/useSwapTransition";

export const RESEARCH_DETAIL_PARAMS = [
  "researcher",
  "paper",
  "publication",
  "project",
  "similar",
] as const;

export const TRANSITION_MS = 250;
const VIEW_BASE =
  "transition-[opacity,translate] duration-250 ease-out motion-reduce:transition-none";
// Grid slides out/in from the left, the details view from the right — Back reverses it
const GRID_MOTION = "starting:opacity-0 starting:-translate-x-6";
const GRID_EXIT = "opacity-0 -translate-x-6";
const DETAIL_MOTION = "starting:opacity-0 starting:translate-x-6";
const DETAIL_EXIT = "opacity-0 translate-x-6";

export const BACK_TO_LIST_CLASSES =
  "self-start inline-flex items-center gap-2 rounded-full border border-neutral-500 bg-overlay/5 px-4 py-1.5 text-sm text-neutral-100 transition-colors duration-200 hover:border-primary-300 hover:text-primary-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200 cursor-pointer";

export function BackToListButton({
  onClick,
  label = "Back to list",
}: {
  onClick?: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={BACK_TO_LIST_CLASSES}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}

export function ResearchDetailShell({
  onBack,
  backParam,
  children,
}: {
  onBack?: () => void;
  backParam?: string;
  children: ReactNode;
}) {
  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (backParam) params.delete(backParam);
      params.delete("similar");
      const query = params.toString();
      window.history.pushState(
        null,
        "",
        query ? `?${query}` : window.location.pathname,
      );
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <BackToListButton onClick={handleBack} />
      {children}
    </div>
  );
}

export function ResearchDetailState({
  label,
  loading,
  notFound,
  error,
  onRetry,
}: {
  label: string;
  loading: boolean;
  notFound: boolean;
  error?: string;
  onRetry: () => void;
}) {
  const lower = label.toLowerCase();
  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-24 text-neutral-200"
        role="status"
      >
        <Loader2
          className="size-5 animate-spin text-accent-300"
          aria-hidden="true"
        />
        Loading {lower}…
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <h2 className="text-2xl font-semibold text-accent-300">
          {label} not found
        </h2>
        <p className="max-w-md text-neutral-100">
          We couldn&apos;t find a {lower} matching this ID.
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center gap-3 py-20 text-center"
      >
        <h2 className="text-2xl font-semibold text-danger-300">
          {label} unavailable
        </h2>
        <p className="max-w-md text-neutral-100">{error}</p>
        <Button
          type="button"
          variant="outlined"
          intent="accent"
          size="md"
          onClick={onRetry}
        >
          Try again
        </Button>
      </div>
    );
  }
  return null;
}

export function ResearchCatalogSwap<T extends string | number>({
  activeId,
  renderDetail,
  children,
}: {
  activeId: T | null;
  renderDetail: (shownId: T) => ReactNode;
  children: ReactNode;
}) {
  const { shown: shownId, leaving } = useSwapTransition(
    activeId,
    TRANSITION_MS,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  // Bring the swapped-in view's top into sight (a long grid may be scrolled away)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const node = containerRef.current;
    if (node && node.getBoundingClientRect().top < 0) {
      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      node.scrollIntoView({
        behavior: prefersReduced ? "auto" : "smooth",
        block: "start",
      });
    }
  }, [shownId]);

  const isDetail = shownId !== null;
  const motion = isDetail
    ? `${DETAIL_MOTION} ${leaving ? DETAIL_EXIT : ""}`
    : `${GRID_MOTION} ${leaving ? GRID_EXIT : ""}`;

  return (
    <div ref={containerRef} className="scroll-mt-28">
      <div
        key={shownId ?? "grid"}
        className={`${VIEW_BASE} ${motion}`}
        aria-busy={leaving || undefined}
      >
        {isDetail ? renderDetail(shownId) : children}
      </div>
    </div>
  );
}
