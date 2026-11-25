"use client";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import Button from "@/src/components/ui/Button/Button";

export type PaginationToken = number | "ellipsis-start" | "ellipsis-end";

/**
 * Builds a compact, fixed-feel sequence of page numbers and ellipsis markers.
 * Always includes page 1, totalPages, and a window around the current page.
 */
export function buildPaginationRange(
  page: number,
  totalPages: number,
): PaginationToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const clamped = Math.min(Math.max(page, 1), totalPages);
  const tokens: PaginationToken[] = [1];

  if (clamped <= 4) {
    for (let p = 2; p <= 5; p += 1) tokens.push(p);
    tokens.push("ellipsis-end", totalPages);
    return tokens;
  }

  if (clamped >= totalPages - 3) {
    tokens.push("ellipsis-start");
    for (let p = totalPages - 4; p <= totalPages - 1; p += 1) tokens.push(p);
    tokens.push(totalPages);
    return tokens;
  }

  tokens.push(
    "ellipsis-start",
    clamped - 1,
    clamped,
    clamped + 1,
    "ellipsis-end",
    totalPages,
  );
  return tokens;
}

function scrollResultsIntoView() {
  if (
    typeof window === "undefined" ||
    /jsdom/i.test(window.navigator.userAgent)
  ) {
    return;
  }
  const prefersReducedMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  try {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  } catch {
    // Ignore environments where window.scrollTo is unavailable.
  }
}

export default function CatalogPagination({
  label,
  page,
  totalPages,
  onPageChange,
  disabled = false,
  scrollToTop = true,
}: {
  label: string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  scrollToTop?: boolean;
}) {
  if (totalPages <= 1) return null;

  const tokens = buildPaginationRange(page, totalPages);

  const selectPage = (nextPage: number) => {
    if (disabled || nextPage === page || nextPage < 1 || nextPage > totalPages) {
      return;
    }
    onPageChange(nextPage);
    if (scrollToTop) scrollResultsIntoView();
  };

  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-center gap-2 border-t border-neutral-600/70 pt-6 sm:gap-3"
    >
      <Button
        variant="outlined"
        intent="accent"
        size="md"
        className="min-h-11 rounded-xl px-3.5 sm:px-4"
        iconLeft={<ChevronLeft aria-hidden="true" className="size-4" />}
        disabled={disabled || page <= 1}
        onClick={() => selectPage(page - 1)}
      >
        Previous
      </Button>

      {/* Numbered page strip on tablet/desktop */}
      <ol className="hidden items-center gap-1.5 sm:flex">
        {tokens.map((token) =>
          typeof token === "number" ? (
            <li key={token}>
              <button
                type="button"
                aria-label={`Page ${token}`}
                aria-current={token === page ? "page" : undefined}
                disabled={disabled}
                onClick={() => selectPage(token)}
                className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200 disabled:cursor-not-allowed disabled:opacity-50 ${
                  token === page
                    ? "cursor-default border-accent-400 bg-accent-700/30 font-semibold text-accent-200"
                    : "cursor-pointer border-neutral-600/70 bg-overlay/5 text-neutral-100 hover:border-accent-400/60 hover:bg-accent-700/15 hover:text-neutral-50"
                }`}
              >
                {token}
              </button>
            </li>
          ) : (
            <li
              key={token}
              aria-hidden="true"
              className="inline-flex min-h-11 min-w-8 items-center justify-center text-neutral-300 select-none"
            >
              <MoreHorizontal className="size-4" />
            </li>
          ),
        )}
      </ol>

      {/* Compact indicator on small mobile screens */}
      <span className="inline-flex min-h-11 items-center rounded-xl border border-neutral-600/70 bg-overlay/5 px-3.5 text-sm font-medium text-neutral-100 sm:hidden">
        Page {page} of {totalPages}
      </span>

      <Button
        variant="outlined"
        intent="accent"
        size="md"
        className="min-h-11 rounded-xl px-3.5 sm:px-4"
        iconRight={<ChevronRight aria-hidden="true" className="size-4" />}
        disabled={disabled || page >= totalPages}
        onClick={() => selectPage(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
