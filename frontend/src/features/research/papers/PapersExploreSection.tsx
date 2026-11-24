"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  ChevronDown,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Quote,
  Search,
  SearchX,
} from "lucide-react";
import Badge from "@/src/components/ui/Badge/Badge";
import Button from "@/src/components/ui/Button/Button";
import getButtonClasses from "@/src/components/ui/Button/button.style";
import { Input } from "@/src/components/ui/InputField/Input";
import {
  EXPLORE_DEFAULT_LIMIT,
  ExploreApiError,
  explorePapers,
  type ExploreErrorKind,
  type ExploreMode,
  type ExplorePaper,
  type ExploreResult,
} from "./explore.api";

interface SubmittedExploreRequest {
  mode: ExploreMode;
  query: string;
  paperId: string;
  year: number | null;
  bypassCache: boolean;
  seq: number;
}

type ExploreViewState =
  | { status: "idle" }
  | { status: "loading"; reqSeq: number }
  | { status: "success"; result: ExploreResult }
  | {
      status: "error";
      kind: ExploreErrorKind;
      message: string;
      retryAfterSeconds: number | null;
    };

function formatAuthorList(paper: ExplorePaper): string | null {
  if (!paper.authors.length) return null;
  const shown = paper.authors.slice(0, 3).map((author) => author.name);
  const remaining = paper.authors.length - shown.length;
  return remaining > 0 ? `${shown.join(", ")} +${remaining} more` : shown.join(", ");
}

export default function PapersExploreSection({
  suggestedQuery = "",
}: {
  suggestedQuery?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<ExploreMode>("search");
  const [queryInput, setQueryInput] = useState("");
  const [paperIdInput, setPaperIdInput] = useState("");
  const [yearInput, setYearInput] = useState("");
  const [validationHint, setValidationHint] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedExploreRequest | null>(null);
  const [view, setView] = useState<ExploreViewState>({ status: "idle" });

  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  function runRequest(nextReq: SubmittedExploreRequest) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSubmitted(nextReq);
    setView({ status: "loading", reqSeq: nextReq.seq });

    explorePapers(
      {
        mode: nextReq.mode,
        query: nextReq.query,
        paperId: nextReq.paperId,
        year: nextReq.year,
        limit: EXPLORE_DEFAULT_LIMIT,
        bypassCache: nextReq.bypassCache,
      },
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setView({ status: "success", result });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || axios.isCancel(cause)) return;
        if (cause instanceof ExploreApiError) {
          setView({
            status: "error",
            kind: cause.kind,
            message: cause.message,
            retryAfterSeconds: cause.retryAfterSeconds,
          });
          return;
        }
        setView({
          status: "error",
          kind: "unknown",
          message:
            cause instanceof Error && cause.message
              ? cause.message
              : "Semantic Scholar discovery is temporarily unavailable.",
          retryAfterSeconds: null,
        });
      });
  }

  function scheduleSubmit(bypassCache = false) {
    const trimmedQuery = queryInput.trim();
    const trimmedPaperId = paperIdInput.trim();
    const trimmedYear = yearInput.trim();

    if (mode === "search" && !trimmedQuery) {
      setValidationHint("Enter keywords to search Semantic Scholar.");
      return;
    }
    if (mode === "recommend" && !trimmedPaperId) {
      setValidationHint(
        "Enter a Semantic Scholar paper ID or numeric Corpus ID.",
      );
      return;
    }

    let parsedYear: number | null = null;
    if (mode === "search" && trimmedYear) {
      const yr = Number(trimmedYear);
      if (!/^\d{4}$/.test(trimmedYear) || yr < 1900 || yr > 9999) {
        setValidationHint("Enter a valid 4-digit start year (e.g. 2022).");
        return;
      }
      parsedYear = yr;
    }

    setValidationHint(null);
    seqRef.current += 1;
    const nextReq: SubmittedExploreRequest = {
      mode,
      query: trimmedQuery,
      paperId: trimmedPaperId,
      year: parsedYear,
      bypassCache,
      seq: seqRef.current,
    };

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    // Short debounce coalesces rapid double-clicks/Enters without delaying normal clicks
    debounceTimerRef.current = setTimeout(() => {
      runRequest(nextReq);
    }, 120);
  }

  function handleRetry() {
    if (!submitted) {
      scheduleSubmit(true);
      return;
    }
    seqRef.current += 1;
    runRequest({
      ...submitted,
      bypassCache: true,
      seq: seqRef.current,
    });
  }

  const trimmedSuggestion = suggestedQuery.trim();

  return (
    <section
      aria-labelledby="s2-explore-heading"
      className="mt-4 rounded-3xl border border-primary-300/60 bg-brand-gradient p-5 md:p-7"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge size="md" variant="outlined" intent="accent">
              <span className="inline-flex items-center gap-1.5">
                <Globe aria-hidden="true" className="size-3.5" />
                External Source · Semantic Scholar
              </span>
            </Badge>
          </div>
          <h2
            id="s2-explore-heading"
            className="text-xl font-semibold text-primary-200 md:text-2xl"
          >
            Discover more from Semantic Scholar
          </h2>
          <p className="text-sm text-neutral-100">
            Optional external discovery across global literature via Semantic
            Scholar. Results come from Semantic Scholar and open on external
            publisher or Semantic Scholar pages.
          </p>
        </div>

        <Button
          type="button"
          variant="outlined"
          intent="accent"
          size="md"
          className="min-h-11 shrink-0 self-start sm:self-center"
          aria-expanded={expanded}
          aria-controls="s2-explore-panel"
          iconRight={
            <ChevronDown
              aria-hidden="true"
              className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          }
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Hide explorer" : "Explore Semantic Scholar"}
        </Button>
      </div>

      {expanded && (
        <div id="s2-explore-panel" className="mt-6 flex flex-col gap-6 border-t border-neutral-600/60 pt-6">
          <div
            role="tablist"
            aria-label="Semantic Scholar search mode"
            className="flex flex-wrap gap-2"
          >
            <Button
              type="button"
              role="tab"
              aria-selected={mode === "search"}
              size="sm"
              variant={mode === "search" ? "solid" : "outlined"}
              intent="accent"
              onClick={() => {
                setMode("search");
                setValidationHint(null);
              }}
            >
              Topic keywords
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={mode === "recommend"}
              size="sm"
              variant={mode === "recommend" ? "solid" : "outlined"}
              intent="accent"
              onClick={() => {
                setMode("recommend");
                setValidationHint(null);
              }}
            >
              Similar to paper ID
            </Button>

            {mode === "search" &&
              trimmedSuggestion &&
              queryInput.trim() !== trimmedSuggestion && (
                <Button
                  type="button"
                  size="sm"
                  variant="link"
                  intent="accent"
                  onClick={() => {
                    setQueryInput(trimmedSuggestion);
                    setValidationHint(null);
                  }}
                >
                  Use catalog search &ldquo;{trimmedSuggestion}&rdquo;
                </Button>
              )}
          </div>

          <form
            className="flex flex-col gap-3 md:flex-row md:items-start"
            onSubmit={(event) => {
              event.preventDefault();
              scheduleSubmit(false);
            }}
          >
            {mode === "search" ? (
              <>
                <div className="min-w-0 flex-1">
                  <Input
                    type="search"
                    aria-label="Semantic Scholar topic keywords"
                    placeholder="e.g. CMOS neural accelerators, photonic interconnects…"
                    value={queryInput}
                    onChange={(event) => {
                      setQueryInput(event.target.value);
                      if (validationHint) setValidationHint(null);
                    }}
                    endAdornment={<Search aria-hidden="true" className="size-5" />}
                  />
                </div>
                <div className="w-full md:w-40">
                  <Input
                    type="text"
                    inputMode="numeric"
                    aria-label="Published from year (optional)"
                    placeholder="From year"
                    value={yearInput}
                    onChange={(event) => {
                      setYearInput(event.target.value);
                      if (validationHint) setValidationHint(null);
                    }}
                  />
                </div>
              </>
            ) : (
              <div className="min-w-0 flex-1">
                <Input
                  type="text"
                  aria-label="Semantic Scholar paper ID or Corpus ID"
                  placeholder="Enter S2 paper ID or numeric Corpus ID (e.g. 215416146)"
                  value={paperIdInput}
                  onChange={(event) => {
                    setPaperIdInput(event.target.value);
                    if (validationHint) setValidationHint(null);
                  }}
                />
              </div>
            )}

            <Button
              type="submit"
              variant="solid"
              intent="accent"
              size="md"
              className="min-h-11 shrink-0"
              disabled={view.status === "loading"}
            >
              {view.status === "loading" ? (
                <Loader2
                  aria-label="Searching Semantic Scholar"
                  className="size-4 motion-safe:animate-spin"
                />
              ) : mode === "recommend" ? (
                "Find recommendations"
              ) : (
                "Search Semantic Scholar"
              )}
            </Button>
          </form>

          {validationHint && (
            <p role="alert" className="text-sm text-danger-300">
              {validationHint}
            </p>
          )}

          {view.status === "idle" && (
            <p className="text-sm text-neutral-200">
              Submit a topic or paper ID above to request live results from
              Semantic Scholar. No external requests are sent automatically.
            </p>
          )}

          {view.status === "loading" && (
            <div
              role="status"
              className="flex items-center gap-3 py-8 text-sm text-accent-200"
            >
              <Loader2
                aria-hidden="true"
                className="size-5 motion-safe:animate-spin"
              />
              Fetching papers from Semantic Scholar…
            </div>
          )}

          {view.status === "error" && view.kind === "rate_limited" && (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-2xl border border-accent-400/50 bg-overlay/[0.04] p-5 text-sm"
            >
              <div className="flex items-center gap-2 font-semibold text-accent-200">
                <Clock aria-hidden="true" className="size-4 shrink-0" />
                <h3>Semantic Scholar is rate-limiting requests right now</h3>
              </div>
              <p className="text-neutral-100">
                {view.message}
                {view.retryAfterSeconds
                  ? ` Please wait about ${view.retryAfterSeconds} second${view.retryAfterSeconds === 1 ? "" : "s"} before trying again.`
                  : " Please wait a short moment before trying again."}
              </p>
              <Button
                type="button"
                variant="outlined"
                intent="accent"
                size="sm"
                onClick={handleRetry}
              >
                Try again
              </Button>
            </div>
          )}

          {view.status === "error" && view.kind !== "rate_limited" && (
            <div
              role="alert"
              className="flex flex-col items-center gap-3 py-8 text-center"
            >
              <h3 className="text-lg font-semibold text-danger-300">
                Couldn&apos;t load Semantic Scholar results
              </h3>
              <p className="max-w-md text-sm text-neutral-100">{view.message}</p>
              <Button
                type="button"
                variant="outlined"
                intent="accent"
                size="sm"
                onClick={handleRetry}
              >
                Try again
              </Button>
            </div>
          )}

          {view.status === "success" && view.result.papers.length === 0 && (
            <div className="flex flex-col items-center gap-2.5 py-8 text-center">
              <SearchX aria-hidden="true" className="size-9 text-accent-300" />
              <h3 className="text-lg font-semibold text-primary-200">
                No recommendations found
              </h3>
              <p className="max-w-md text-sm text-neutral-100">
                {view.result.message ??
                  "Semantic Scholar returned no matching papers. Try broader keywords or another paper ID."}
              </p>
            </div>
          )}

          {view.status === "success" && view.result.papers.length > 0 && (
            <div className="flex flex-col gap-4">
              <p role="status" className="text-sm text-accent-200">
                Showing {view.result.papers.length} of{" "}
                {view.result.total.toLocaleString("en")} Semantic Scholar result
                {view.result.total === 1 ? "" : "s"}
              </p>

              <ul
                aria-label="Semantic Scholar results"
                className="grid items-stretch gap-4 md:grid-cols-2"
              >
                {view.result.papers.map((paper) => {
                  const authorSummary = formatAuthorList(paper);
                  return (
                    <li
                      key={paper.paperId}
                      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-neutral-600/80 bg-surface/80 p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge size="sm" variant="outlined" intent="primary">
                          Semantic Scholar
                        </Badge>
                        {paper.year !== null && (
                          <Badge size="sm" variant="solid" intent="accent">
                            {paper.year}
                          </Badge>
                        )}
                      </div>

                      <h3 className="wrap-break-word text-base font-semibold leading-snug text-neutral-50">
                        {paper.title}
                      </h3>

                      {authorSummary && (
                        <p className="wrap-break-word text-xs text-accent-300">
                          {authorSummary}
                        </p>
                      )}

                      {paper.abstract && (
                        <p className="line-clamp-3 wrap-break-word text-sm leading-relaxed text-neutral-100">
                          {paper.abstract}
                        </p>
                      )}

                      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs">
                        {paper.venue && (
                          <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-overlay/[0.06] px-2.5 py-1 text-neutral-200">
                            <FileText
                              aria-hidden="true"
                              className="size-3.5 shrink-0"
                            />
                            <span className="truncate">{paper.venue}</span>
                          </span>
                        )}
                        {paper.citationCount !== null && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-accent-400/50 px-2.5 py-1 font-medium text-accent-300">
                            <Quote aria-hidden="true" className="size-3" />
                            {paper.citationCount.toLocaleString("en")} citation
                            {paper.citationCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>

                      {(paper.url || paper.openAccessPdfUrl) && (
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          {paper.url && (
                            <a
                              href={paper.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`${getButtonClasses({ variant: "outlined", intent: "accent", size: "sm" })} min-h-10 gap-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200`}
                            >
                              View on Semantic Scholar
                              <ExternalLink
                                aria-hidden="true"
                                className="size-3.5 shrink-0"
                              />
                              <span className="sr-only">
                                {" "}
                                for {paper.title} (opens in a new tab)
                              </span>
                            </a>
                          )}
                          {paper.openAccessPdfUrl &&
                            paper.openAccessPdfUrl !== paper.url && (
                              <a
                                href={paper.openAccessPdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-accent-300 hover:underline focus-visible:outline-2 focus-visible:outline-accent-200"
                              >
                                Open-access PDF
                                <ExternalLink
                                  aria-hidden="true"
                                  className="size-3.5 shrink-0"
                                />
                                <span className="sr-only">
                                  {" "}
                                  for {paper.title} (opens in a new tab)
                                </span>
                              </a>
                            )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
