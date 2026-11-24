"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { ExternalLink, FileSearch, Loader2 } from "lucide-react";
import {
  CatalogDetailsLayout,
  CatalogDetailState,
  DetailFields,
  DetailSection,
  safeExternalUrl,
} from "@/src/components/catalog/CatalogDetails";
import getButtonClasses from "@/src/components/ui/Button/button.style";
import { useCatalogDetail } from "@/src/hooks/useCatalogDetail";
import {
  ExploreApiError,
  canFindSimilarForPaper,
  getCachedSimilarPapers,
  requestSimilarPapers,
} from "./explore.api";
import {
  normalizePaper,
  resolvePaperExternalUrl,
  type ResearchPaper,
} from "./paper.api";
import SimilarPapersSection, {
  type SimilarPapersState,
} from "./SimilarPapersSection";

const ACTION_BUTTON_CLASSES = `${getButtonClasses({ intent: "accent", variant: "outlined", size: "md" })} min-h-11 w-fit gap-2 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200`;

export default function PaperDetails({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const autoTriggerSimilar = searchParams.get("similar") === "1";

  const {
    data: rawPaper,
    loading,
    notFound,
    error,
    reload,
  } = useCatalogDetail<ResearchPaper>(id, "/papers");

  const paper = rawPaper ? normalizePaper(rawPaper) : undefined;
  const directUrl = safeExternalUrl(paper?.url);
  const sourceUrl = resolvePaperExternalUrl(paper);
  const canFindSimilar = canFindSimilarForPaper(paper);
  const currentPaperId = paper?.id ?? null;
  const currentPaperTitle = paper?.title ?? "";
  const currentPaperDoi = paper?.doi ?? null;

  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarState, setSimilarState] = useState<SimilarPapersState>({
    status: "idle",
  });
  const [trackedPaperId, setTrackedPaperId] = useState<number | null>(
    () => currentPaperId,
  );

  const sectionRef = useRef<HTMLElement | null>(null);
  const activePaperIdRef = useRef<number | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  // Reset similar-papers UI synchronously when navigating to a different paper ID
  if (trackedPaperId !== currentPaperId) {
    setTrackedPaperId(currentPaperId);
    setSimilarOpen(false);
    setSimilarState({ status: "idle" });
  }

  useEffect(() => {
    activePaperIdRef.current = currentPaperId;
    return () => {
      cancelRef.current?.();
      cancelRef.current = null;
    };
  }, [currentPaperId]);

  function scrollSectionIntoView() {
    requestAnimationFrame(() => {
      const node = sectionRef.current;
      if (!node || typeof node.scrollIntoView !== "function") return;
      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      node.scrollIntoView({
        behavior: prefersReduced ? "auto" : "smooth",
        block: "nearest",
      });
    });
  }

  function startSimilarFetch(
    targetPaper: ResearchPaper,
    bypassCache: boolean,
    shouldScroll: boolean,
  ) {
    if (!canFindSimilarForPaper(targetPaper)) return;
    cancelRef.current?.();

    const targetId = targetPaper.id;
    setSimilarOpen(true);
    setSimilarState({ status: "loading" });
    if (shouldScroll) scrollSectionIntoView();

    const handle = requestSimilarPapers(
      { id: targetId, title: targetPaper.title, doi: targetPaper.doi },
      { bypassCache },
    );
    cancelRef.current = handle.cancel;

    handle.promise
      .then((result) => {
        if (activePaperIdRef.current !== targetId) return;
        setSimilarState({ status: "success", result });
      })
      .catch((cause: unknown) => {
        if (axios.isCancel(cause) || activePaperIdRef.current !== targetId) {
          return;
        }
        if (cause instanceof ExploreApiError) {
          setSimilarState({
            status: "error",
            kind: cause.kind,
            message: cause.message,
            retryAfterSeconds: cause.retryAfterSeconds,
          });
          return;
        }
        setSimilarState({
          status: "error",
          kind: "unknown",
          message:
            cause instanceof Error && cause.message
              ? cause.message
              : "Could not load similar papers right now.",
          retryAfterSeconds: null,
        });
      });
  }

  // Trigger automatically when opened from a paper card's "Find Similar" button (?similar=1)
  useEffect(() => {
    if (
      !autoTriggerSimilar ||
      currentPaperId === null ||
      !currentPaperTitle.trim()
    ) {
      return;
    }

    const targetId = currentPaperId;
    const cached = getCachedSimilarPapers(targetId);
    const handle = requestSimilarPapers(
      { id: targetId, title: currentPaperTitle, doi: currentPaperDoi },
      { bypassCache: false },
    );
    cancelRef.current = handle.cancel;

    let active = true;
    // Defer initial state update to microtask to satisfy React Compiler effect rules
    Promise.resolve().then(() => {
      if (!active || activePaperIdRef.current !== targetId) return;
      setSimilarOpen(true);
      if (cached) {
        setSimilarState({ status: "success", result: cached });
      } else {
        setSimilarState({ status: "loading" });
      }
    });

    handle.promise
      .then((result) => {
        if (!active || activePaperIdRef.current !== targetId) return;
        setSimilarState({ status: "success", result });
      })
      .catch((cause: unknown) => {
        if (
          !active ||
          axios.isCancel(cause) ||
          activePaperIdRef.current !== targetId
        ) {
          return;
        }
        if (cause instanceof ExploreApiError) {
          setSimilarState({
            status: "error",
            kind: cause.kind,
            message: cause.message,
            retryAfterSeconds: cause.retryAfterSeconds,
          });
          return;
        }
        setSimilarState({
          status: "error",
          kind: "unknown",
          message:
            cause instanceof Error && cause.message
              ? cause.message
              : "Could not load similar papers right now.",
          retryAfterSeconds: null,
        });
      });

    return () => {
      active = false;
      handle.cancel();
    };
  }, [autoTriggerSimilar, currentPaperId, currentPaperTitle, currentPaperDoi]);

  function handleFindSimilarClick() {
    if (!paper || !canFindSimilar || similarState.status === "loading") return;

    // If we already have cached results for this paper, toggle collapse/expand without re-fetching
    const cached = getCachedSimilarPapers(paper.id);
    if (cached) {
      const nextOpen = !similarOpen;
      setSimilarOpen(nextOpen);
      setSimilarState({ status: "success", result: cached });
      if (nextOpen) scrollSectionIntoView();
      return;
    }

    // If an error is currently shown, collapse/expand without re-fetching (Retry re-requests)
    if (similarState.status === "error") {
      const nextOpen = !similarOpen;
      setSimilarOpen(nextOpen);
      if (nextOpen) scrollSectionIntoView();
      return;
    }

    startSimilarFetch(paper, false, true);
  }

  function handleRetrySimilar() {
    if (!paper || similarState.status === "loading") return;
    startSimilarFetch(paper, true, false);
  }

  const similarLoading = similarState.status === "loading";

  const infoFields: { label: string; value: ReactNode }[] = paper
    ? [
        { label: "Author", value: paper.staff?.name },
        { label: "Journal", value: paper.journalTitle },
        { label: "Source", value: paper.sourceName },
        { label: "Publication year", value: paper.publicationYear },
        { label: "Publication month", value: paper.publicationMonth },
        { label: "Publication day", value: paper.publicationDay },
        { label: "Type", value: paper.type },
        {
          label: "DOI",
          value: paper.doi ? (
            <span className="wrap-break-word">{paper.doi}</span>
          ) : null,
        },
        {
          label: "ORCID path",
          value: paper.orcidPath ? (
            <span className="wrap-break-word">{paper.orcidPath}</span>
          ) : null,
        },
        {
          label: "ORCID work identifier",
          value: paper.putCode ? (
            <span className="wrap-break-word">{paper.putCode}</span>
          ) : null,
        },
      ].filter(
        (field) =>
          field.value !== null &&
          field.value !== undefined &&
          field.value !== "",
      )
    : [];

  return (
    <CatalogDetailsLayout
      backHref="/research?tab=papers"
      backLabel="Back to papers"
    >
      <CatalogDetailState
        label="Paper"
        loading={loading}
        notFound={notFound}
        error={error}
        onRetry={reload}
      />
      {paper && (
        <article className="flex min-w-0 flex-col gap-6">
          <header className="rounded-3xl border border-neutral-700 bg-brand-gradient p-6 md:p-8">
            {paper.journalTitle && (
              <p className="mb-3 wrap-break-word text-lg text-accent-300">
                {paper.journalTitle}
              </p>
            )}
            <h1 className="wrap-break-word text-h2-sm text-neutral-50 md:text-h2">
              {paper.title}
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ACTION_BUTTON_CLASSES}
                >
                  {directUrl
                    ? "Read paper on source website"
                    : "View paper via DOI"}
                  <ExternalLink
                    aria-hidden="true"
                    className="size-4 shrink-0"
                  />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
              <button
                type="button"
                disabled={similarLoading || !canFindSimilar}
                aria-busy={similarLoading || undefined}
                aria-expanded={similarOpen}
                aria-controls="similar-papers-section"
                aria-label={
                  canFindSimilar
                    ? `Find similar papers to ${paper.title}`
                    : `Find similar papers to ${paper.title || "this paper"} (unavailable)`
                }
                title={
                  canFindSimilar
                    ? undefined
                    : "Paper title is required to find similar papers"
                }
                onClick={handleFindSimilarClick}
                className={`${ACTION_BUTTON_CLASSES} ${similarLoading || !canFindSimilar ? "opacity-50 pointer-events-none cursor-default" : ""}`}
              >
                <span>Find Similar</span>
                {similarLoading ? (
                  <Loader2
                    aria-hidden="true"
                    className="size-4 shrink-0 motion-safe:animate-spin"
                  />
                ) : (
                  <FileSearch aria-hidden="true" className="size-4 shrink-0" />
                )}
              </button>
            </div>
          </header>

          {similarOpen && (
            <SimilarPapersSection
              sectionRef={sectionRef}
              state={similarState}
              onRetry={handleRetrySimilar}
            />
          )}

          {paper.subtitle && (
            <DetailSection title="Summary">
              <p className="whitespace-pre-wrap wrap-break-word text-neutral-100">
                {paper.subtitle}
              </p>
            </DetailSection>
          )}

          {infoFields.length > 0 && (
            <DetailSection title="Paper information">
              <DetailFields fields={infoFields} />
            </DetailSection>
          )}
        </article>
      )}
    </CatalogDetailsLayout>
  );
}
