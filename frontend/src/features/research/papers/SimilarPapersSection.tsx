"use client";

import type { RefObject } from "react";
import { Clock, ExternalLink, FileText, Globe, SearchX } from "lucide-react";
import Badge from "@/src/components/ui/Badge/Badge";
import Button from "@/src/components/ui/Button/Button";
import type {
  ExploreErrorKind,
  ExplorePaper,
  ExploreResult,
} from "./explore.api";

export type SimilarPapersState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: ExploreResult }
  | {
      status: "error";
      kind: ExploreErrorKind;
      message: string;
      retryAfterSeconds: number | null;
    };

function formatAuthors(paper: ExplorePaper): string | null {
  if (!paper.authors.length) return null;
  const shown = paper.authors.slice(0, 3).map((author) => author.name);
  const remaining = paper.authors.length - shown.length;
  return remaining > 0
    ? `${shown.join(", ")} +${remaining} more`
    : shown.join(", ");
}

export default function SimilarPapersSection({
  sectionRef,
  state,
  onRetry,
}: {
  sectionRef?: RefObject<HTMLElement | null>;
  state: SimilarPapersState;
  onRetry: () => void;
}) {
  if (state.status === "idle") return null;

  const liveAnnouncement =
    state.status === "loading"
      ? "Loading similar papers from Semantic Scholar…"
      : state.status === "error"
        ? state.kind === "rate_limited"
          ? "Semantic Scholar rate limit reached."
          : "Could not load similar papers."
        : state.result.papers.length === 0
          ? "No similar papers found."
          : `Found ${state.result.papers.length} similar paper${state.result.papers.length === 1 ? "" : "s"} from Semantic Scholar.`;

  return (
    <section
      ref={sectionRef}
      id="similar-papers-section"
      aria-labelledby="similar-papers-heading"
      aria-busy={state.status === "loading" || undefined}
      className="rounded-3xl border border-primary-300/50 bg-overlay/[0.04] p-5 md:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="similar-papers-heading"
          className="text-lg font-medium text-primary-200"
        >
          Similar papers
        </h2>
        <Badge size="sm" variant="outlined" intent="accent">
          <span className="inline-flex items-center gap-1.5">
            <Globe aria-hidden="true" className="size-3.5" />
            From Semantic Scholar
          </span>
        </Badge>
      </div>

      <p role="status" aria-live="polite" className="mb-4 text-sm text-accent-200">
        {liveAnnouncement}
      </p>

      {state.status === "loading" && (
        <ul
          aria-hidden="true"
          className="flex flex-col gap-3"
        >
          {Array.from({ length: 3 }, (_, idx) => (
            <li
              key={idx}
              className="rounded-2xl border border-neutral-600/60 bg-surface/60 p-4 motion-safe:animate-pulse"
            >
              <div className="h-4 w-4/5 rounded bg-neutral-700" />
              <div className="mt-2.5 h-3.5 w-1/2 rounded bg-neutral-800" />
              <div className="mt-3 h-3.5 w-1/3 rounded bg-neutral-800" />
            </li>
          ))}
        </ul>
      )}

      {state.status === "error" && state.kind === "rate_limited" && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl border border-accent-400/50 bg-surface/60 p-4 text-sm"
        >
          <div className="flex items-center gap-2 font-semibold text-accent-200">
            <Clock aria-hidden="true" className="size-4 shrink-0" />
            <h3>Semantic Scholar is temporarily rate-limiting requests</h3>
          </div>
          <p className="text-neutral-100">
            {state.message}
            {state.retryAfterSeconds
              ? ` Please wait about ${state.retryAfterSeconds} second${state.retryAfterSeconds === 1 ? "" : "s"} before retrying.`
              : " Please wait a short moment before retrying."}
          </p>
          <Button
            type="button"
            variant="outlined"
            intent="accent"
            size="sm"
            onClick={onRetry}
          >
            Retry
          </Button>
        </div>
      )}

      {state.status === "error" && state.kind !== "rate_limited" && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl border border-danger-300/40 bg-surface/60 p-4 text-sm"
        >
          <p className="font-medium text-danger-300">
            Could not load similar papers
          </p>
          <p className="text-neutral-100">{state.message}</p>
          <Button
            type="button"
            variant="outlined"
            intent="accent"
            size="sm"
            onClick={onRetry}
          >
            Retry
          </Button>
        </div>
      )}

      {state.status === "success" && state.result.papers.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <SearchX aria-hidden="true" className="size-8 text-accent-300" />
          <p className="font-medium text-primary-200">
            No similar papers found
          </p>
          <p className="max-w-md text-sm text-neutral-200">
            {state.result.message ??
              "Semantic Scholar did not return similar papers for this record."}
          </p>
        </div>
      )}

      {state.status === "success" && state.result.papers.length > 0 && (
        <ul
          aria-label="Similar papers from Semantic Scholar"
          className="flex flex-col gap-3"
        >
          {state.result.papers.map((item) => {
            const authors = formatAuthors(item);
            return (
              <li
                key={item.paperId}
                className="flex min-w-0 flex-col gap-2 rounded-2xl border border-neutral-600/70 bg-surface/75 p-4"
              >
                <h3 className="wrap-break-word text-base font-medium leading-snug text-neutral-50">
                  {item.title}
                </h3>

                {authors && (
                  <p className="wrap-break-word text-xs text-accent-300">
                    {authors}
                  </p>
                )}

                {(item.year !== null || item.venue) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {item.year !== null && (
                      <Badge size="sm" variant="solid" intent="accent">
                        {item.year}
                      </Badge>
                    )}
                    {item.venue && (
                      <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-overlay/[0.06] px-2 py-0.5 text-neutral-200">
                        <FileText
                          aria-hidden="true"
                          className="size-3.5 shrink-0"
                        />
                        <span className="truncate">{item.venue}</span>
                      </span>
                    )}
                  </div>
                )}

                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex min-h-9 w-fit items-center gap-1 text-xs font-medium text-accent-300 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200"
                  >
                    Read on Semantic Scholar
                    <ExternalLink
                      aria-hidden="true"
                      className="size-3.5 shrink-0"
                    />
                    <span className="sr-only">
                      {" "}
                      for {item.title} (opens in a new tab)
                    </span>
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
