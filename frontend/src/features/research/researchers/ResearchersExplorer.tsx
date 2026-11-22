"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import notFoundAnimation from "@/src/components/assets/NotFound.json";
import Button from "@/src/components/ui/Button/Button";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import { useSwapTransition } from "@/src/hooks/useSwapTransition";
import type { Paginated } from "@/src/lib/api-client";
import ResearcherGrid from "./ResearcherGrid";
import ResearcherToolbar from "./ResearcherToolbar";
import ResearcherProfile from "./profile/ResearcherProfile";
import { RESEARCHERS_PAGE_SIZE, fetchResearchers } from "./researcher.api";
import {
  EMPTY_RESEARCHER_FILTERS,
  hasActiveResearcherFilters,
  mergeUniqueResearchers,
  researcherFiltersKey,
  toResearcherSummary,
} from "./researcher.utils";
import { PANEL_SHELL } from "./researcher.style";
import type {
  AcademicResearcher,
  ResearcherFacets,
  ResearcherFilters,
} from "./researcher.type";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

export const RESEARCHER_PARAM = "researcher";

const TRANSITION_MS = 250;
const VIEW_BASE =
  "transition-[opacity,translate] duration-250 ease-out motion-reduce:transition-none";
// Grid slides out/in from the left, the profile from the right — Back reverses it
const GRID_MOTION = "starting:opacity-0 starting:-translate-x-6";
const GRID_EXIT = "opacity-0 -translate-x-6";
const PROFILE_MOTION = "starting:opacity-0 starting:translate-x-6";
const PROFILE_EXIT = "opacity-0 translate-x-6";

const NO_FACETS: ResearcherFacets = { topics: [], departments: [], universities: [] };

export function parseResearcherId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return id > 0 ? id : null;
}

interface ResearchersExplorerProps {
  initialPage?: Paginated<AcademicResearcher> | null;
  facets?: ResearcherFacets;
  /** Set when the server's first request failed; profiles opened by URL still work */
  initialError?: string;
}

interface LoadedState {
  key: string;
  items: AcademicResearcher[];
  total: number | null;
  totalPages: number;
  pageError: string | null;
  loadMoreError: string | null;
}

const requestKey = (filterKey: string, page: number, attempt: number) =>
  `${filterKey}#${page}#${attempt}`;

const GridSkeleton = () => (
  <div
    className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
    role="status"
    aria-label="Loading researchers"
  >
    {Array.from({ length: 6 }, (_, index) => (
      <div
        key={index}
        className="h-64 rounded-2xl border border-neutral-500 bg-white/5 animate-pulse"
      />
    ))}
  </div>
);

const ResearchersExplorer = ({
  initialPage,
  facets = NO_FACETS,
  initialError,
}: ResearchersExplorerProps) => {
  const searchParams = useSearchParams();
  const selectedId = parseResearcherId(searchParams.get(RESEARCHER_PARAM));
  const { shown: shownId, leaving } = useSwapTransition(selectedId, TRANSITION_MS);

  const [filters, setFilters] = useState<ResearcherFilters>(EMPTY_RESEARCHER_FILTERS);
  const debouncedSearch = useDebouncedValue(filters.search, 300);
  const applied: ResearcherFilters = { ...filters, search: debouncedSearch };
  const appliedKey = researcherFiltersKey(applied);

  // Page resets to 1 whenever the applied filters change (even when returning to a previous filter)
  const [prevAppliedKey, setPrevAppliedKey] = useState(appliedKey);
  const [page, setPage] = useState(1);
  if (prevAppliedKey !== appliedKey) {
    setPrevAppliedKey(appliedKey);
    setPage(1);
  }
  const [attempt, setAttempt] = useState(0);
  const wanted = requestKey(appliedKey, page, attempt);

  const [loaded, setLoaded] = useState<LoadedState>(() => {
    const initialKey = requestKey(researcherFiltersKey(EMPTY_RESEARCHER_FILTERS), 1, 0);
    if (initialPage) {
      return {
        key: initialKey,
        items: initialPage.data ?? [],
        total: initialPage.pagination.total,
        totalPages: initialPage.pagination.totalPages,
        pageError: null,
        loadMoreError: null,
      };
    }
    if (initialError) {
      return {
        key: initialKey,
        items: [],
        total: null,
        totalPages: 0,
        pageError: initialError,
        loadMoreError: null,
      };
    }
    // No SSR snapshot provided -> fetch page 1 on mount with skeleton state
    return {
      key: "",
      items: [],
      total: null,
      totalPages: 0,
      pageError: null,
      loadMoreError: null,
    };
  });

  const loading = loaded.key !== wanted;

  useEffect(() => {
    if (loaded.key === wanted) return;
    const controller = new AbortController();

    (async () => {
      try {
        const result = await fetchResearchers(
          {
            page,
            limit: RESEARCHERS_PAGE_SIZE,
            researcher: applied.search,
            mainTopic: applied.mainTopic,
            department: applied.department,
            institutionName: applied.institutionName,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        setLoaded((previous) => ({
          key: wanted,
          items:
            page === 1
              ? (result.data ?? [])
              : mergeUniqueResearchers(previous.items, result.data ?? []),
          total: result.pagination.total,
          totalPages: result.pagination.totalPages,
          pageError: null,
          loadMoreError: null,
        }));
      } catch (cause) {
        if (controller.signal.aborted) return;
        const message =
          cause instanceof Error && cause.message
            ? cause.message
            : "Couldn't load researchers.";

        setLoaded((previous) =>
          page === 1
            ? {
                key: wanted,
                items: [],
                total: null,
                totalPages: 0,
                pageError: message,
                loadMoreError: null,
              }
            : {
                ...previous,
                key: wanted,
                pageError: null,
                loadMoreError: message,
              },
        );
      }
    })();

    return () => controller.abort();
    // `applied` and `page` are captured inside `wanted`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

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
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [shownId]);

  const navigate = (id: number | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id === null) params.delete(RESEARCHER_PARAM);
    else params.set(RESEARCHER_PARAM, String(id));
    // Shallow history entry: no server round trip, useSearchParams still updates,
    // and the browser Back button returns to the grid
    window.history.pushState(null, "", `?${params.toString()}`);
  };

  const isProfile = shownId !== null;
  const motion = isProfile
    ? `${PROFILE_MOTION} ${leaving ? PROFILE_EXIT : ""}`
    : `${GRID_MOTION} ${leaving ? GRID_EXIT : ""}`;

  const summaries = loaded.items.map(toResearcherSummary);
  const canLoadMore =
    loaded.total !== null &&
    loaded.items.length < loaded.total &&
    page < loaded.totalPages;
  const showPageError = Boolean(loaded.pageError) && !loading;
  const showInitialSkeleton = loading && page === 1 && loaded.items.length === 0;
  const showEmpty = !loading && !showPageError && summaries.length === 0;

  return (
    <div ref={containerRef} className="scroll-mt-28">
      <div
        key={shownId ?? "grid"}
        className={`${VIEW_BASE} ${motion}`}
        aria-busy={leaving || undefined}
      >
        {isProfile ? (
          <div className={PANEL_SHELL}>
            <ResearcherProfile
              id={shownId}
              initialResearcher={loaded.items.find((researcher) => researcher.id === shownId)}
              onBack={() => navigate(null)}
            />
          </div>
        ) : (
          <div className={`${PANEL_SHELL} gap-8`}>
            <ResearcherToolbar
              filters={filters}
              facets={facets}
              loadedCount={loaded.items.length}
              total={loaded.pageError ? null : loaded.total}
              onChange={setFilters}
            />

            {showInitialSkeleton ? (
              <GridSkeleton />
            ) : showPageError ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <h3 className="text-2xl font-semibold text-danger-300">
                  Researchers Are Unavailable
                </h3>
                <p className="max-w-md text-neutral-100">{loaded.pageError}</p>
                <Button
                  type="button"
                  variant="outlined"
                  intent="accent"
                  size="md"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Try again
                </Button>
              </div>
            ) : showEmpty ? (
              <div className="flex-1 flex flex-col items-center justify-center pt-6 pb-16 gap-2.5 text-center">
                <div className="relative flex items-center justify-center">
                  <Lottie
                    animationData={notFoundAnimation}
                    loop
                    className="w-64 mx-auto"
                  />
                </div>
                <h3 className="text-2xl font-semibold text-accent-300">
                  {hasActiveResearcherFilters(applied)
                    ? "No Researchers Found"
                    : "Find What You're Looking For"}
                </h3>
                <p className="text-neutral-100">
                  {hasActiveResearcherFilters(applied)
                    ? "No researchers match your current search or filters."
                    : "Choose Topics, Keywords, Or Universities To Begin Your Search."}
                </p>
                {hasActiveResearcherFilters(filters) && (
                  <Button
                    type="button"
                    variant="link"
                    intent="accent"
                    size="md"
                    onClick={() => setFilters(EMPTY_RESEARCHER_FILTERS)}
                  >
                    Reset filters
                  </Button>
                )}
              </div>
            ) : (
              <div
                className={`flex flex-col gap-6 transition-opacity duration-300 ${
                  loading && page === 1 ? "opacity-60" : "opacity-100"
                }`}
                aria-busy={loading}
              >
                <ResearcherGrid researchers={summaries} onViewProfile={navigate} />

                {loaded.loadMoreError && !loading && (
                  <div
                    role="alert"
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-danger-300/40 bg-danger-300/10 p-4 text-center"
                  >
                    <p className="text-sm text-neutral-100">{loaded.loadMoreError}</p>
                    <Button
                      type="button"
                      variant="outlined"
                      intent="accent"
                      size="sm"
                      onClick={() => setAttempt((value) => value + 1)}
                    >
                      Try again
                    </Button>
                  </div>
                )}

                {!loaded.loadMoreError && (canLoadMore || (loading && page > 1)) && (
                  <Button
                    type="button"
                    variant="outlined"
                    intent="secondary"
                    size="md"
                    className="self-center"
                    disabled={loading}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    {loading && page > 1 ? (
                      <Loader2 className="size-4 animate-spin" aria-label="Loading more researchers" />
                    ) : (
                      "Load More"
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResearchersExplorer;
