"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { BookOpen, FileSearch, Search, SearchX } from "lucide-react";
import CatalogCard, {
  CATALOG_GRID,
  CatalogCardsSkeleton,
} from "@/src/components/catalog/CatalogCard";
import CatalogLayout from "@/src/components/catalog/CatalogLayout";
import CatalogPagination from "@/src/components/catalog/CatalogPagination";
import CatalogSourceLink from "@/src/components/catalog/CatalogSourceLink";
import Badge from "@/src/components/ui/Badge/Badge";
import Button from "@/src/components/ui/Button/Button";
import getButtonClasses from "@/src/components/ui/Button/button.style";
import FilterPill from "@/src/components/ui/FilterPill/FilterPill";
import { Input } from "@/src/components/ui/InputField/Input";
import { OptionList } from "@/src/components/ui/OptionList/OptionList";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import type { Paginated } from "@/src/lib/api-client";
import { ResearchCatalogSwap } from "../ResearchDetailShell";
import ResearchYearFilter from "../ResearchYearFilter";
import type { YearRange } from "../researchYears.api";
import { canFindSimilarForPaper } from "./explore.api";
import PaperDetails from "./PaperDetails";
import PapersExploreSection from "./PapersExploreSection";
import {
  PAPERS_PAGE_SIZE,
  fetchPapers,
  type PaperSortField,
  type PaperSortOrder,
  type ResearchPaper,
} from "./paper.api";

export const PAPER_PARAM = "paper";

const PAPER_CARD_ACTION_CLASSES = `${getButtonClasses({ variant: "outlined", intent: "accent", size: "md" })} min-h-11 h-full w-full gap-1.5 whitespace-nowrap px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-200`;

export type PaperSortOptionKey =
  | "year_desc"
  | "year_asc"
  | "title_asc"
  | "title_desc"
  | "journal_asc"
  | "created_desc";

const PAPER_SORT_OPTIONS: {
  value: PaperSortOptionKey;
  label: string;
  sortBy: PaperSortField;
  order: PaperSortOrder;
}[] = [
  {
    value: "year_desc",
    label: "Year: newest",
    sortBy: "publicationYear",
    order: "desc",
  },
  {
    value: "year_asc",
    label: "Year: oldest",
    sortBy: "publicationYear",
    order: "asc",
  },
  {
    value: "title_asc",
    label: "Title A–Z",
    sortBy: "title",
    order: "asc",
  },
  {
    value: "title_desc",
    label: "Title Z–A",
    sortBy: "title",
    order: "desc",
  },
  {
    value: "journal_asc",
    label: "Journal A–Z",
    sortBy: "journalTitle",
    order: "asc",
  },
  {
    value: "created_desc",
    label: "Recently added",
    sortBy: "createdAt",
    order: "desc",
  },
];

export default function PapersExplorer() {
  const searchParams = useSearchParams();
  const selectedId = searchParams?.get(PAPER_PARAM)?.trim() || null;

  const [search, setSearch] = useState("");
  const [yearRange, setYearRange] = useState<YearRange>(null);
  const [sortKey, setSortKey] = useState<PaperSortOptionKey>("year_desc");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);

  const navigate = (
    id: number | string | null,
    options?: { similar?: boolean },
  ) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", "papers");
    if (id === null) {
      params.delete(PAPER_PARAM);
      params.delete("similar");
    } else {
      params.set(PAPER_PARAM, String(id));
      if (options?.similar) params.set("similar", "1");
      else params.delete("similar");
    }
    window.history.pushState(null, "", `?${params.toString()}`);
  };

  const activeSort =
    PAPER_SORT_OPTIONS.find((opt) => opt.value === sortKey) ??
    PAPER_SORT_OPTIONS[0];

  const term = search.trim();
  const debouncedTerm = useDebouncedValue(term, 300);
  const debouncedYear = useDebouncedValue(yearRange, 300);
  const queryReady = term === debouncedTerm && yearRange === debouncedYear;
  const key = JSON.stringify([
    debouncedTerm,
    debouncedYear,
    activeSort.sortBy,
    activeSort.order,
    page,
    retry,
  ]);

  const [result, setResult] = useState<{
    key: string;
    data?: Paginated<ResearchPaper>;
    error?: string;
  }>();

  useEffect(() => {
    if (!queryReady) return;
    const controller = new AbortController();
    fetchPapers(
      {
        search: debouncedTerm,
        yearRange: debouncedYear,
        page,
        limit: PAPERS_PAGE_SIZE,
        sortBy: activeSort.sortBy,
        order: activeSort.order,
      },
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && !axios.isCancel(cause)) {
          setResult({
            key,
            error:
              cause instanceof Error ? cause.message : "Could not load papers.",
          });
        }
      });
    return () => controller.abort();
  }, [
    activeSort.order,
    activeSort.sortBy,
    debouncedTerm,
    debouncedYear,
    key,
    page,
    queryReady,
  ]);

  const loading = !queryReady || result?.key !== key;
  const currentError = result?.key === key ? result.error : undefined;
  const data = result?.data;
  const showInitialSkeleton = loading && !data;
  const isRefetching = loading && Boolean(data);
  const pagination = data?.pagination;
  const total = pagination?.total ?? 0;
  const first =
    pagination && total > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const last = pagination
    ? Math.min(pagination.page * pagination.limit, total)
    : 0;

  return (
    <ResearchCatalogSwap
      activeId={selectedId}
      renderDetail={(shownId) => (
        <PaperDetails
          id={shownId}
          initialPaper={data?.data.find(
            (paper) => String(paper.id) === shownId,
          )}
          onBack={() => navigate(null)}
        />
      )}
    >
      <div className="flex min-w-0 flex-col gap-8">
        <CatalogLayout
          resultsLabel="Paper results"
          activeFilterCount={yearRange ? 1 : 0}
          search={
            <Input
              type="search"
              aria-label="Search papers"
              placeholder="Search by title, journal or DOI"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              endAdornment={<Search aria-hidden="true" className="size-5" />}
            />
          }
          toolbar={
            <FilterPill label={`Sort: ${activeSort.label}`}>
              <OptionList<PaperSortOptionKey>
                inputType="radio"
                options={PAPER_SORT_OPTIONS.map(({ value, label }) => ({
                  value,
                  label,
                }))}
                selected={[sortKey]}
                onToggle={(nextKey) => {
                  setSortKey(nextKey);
                  setPage(1);
                }}
              />
            </FilterPill>
          }
          filters={
            <ResearchYearFilter
              catalog="papers"
              value={yearRange}
              onChange={(value) => {
                setYearRange(value);
                setPage(1);
              }}
            />
          }
        >
          <p role="status" className="text-sm text-accent-200">
            {showInitialSkeleton
              ? "Loading papers…"
              : currentError
                ? "Papers unavailable"
                : total > 0 && first <= last
                  ? `Showing ${first}–${last} of ${total} paper${total === 1 ? "" : "s"}`
                  : `${total} paper${total === 1 ? "" : "s"}`}
          </p>

          <div
            aria-busy={loading}
            className={`transition-opacity duration-150 ${isRefetching ? "opacity-60" : "opacity-100"}`}
          >
            {showInitialSkeleton ? (
              <CatalogCardsSkeleton count={12} />
            ) : currentError ? (
              <div
                role="alert"
                className="flex flex-col items-center gap-3 py-12 text-center"
              >
                <h3 className="text-xl font-semibold text-danger-300">
                  Couldn&apos;t load papers
                </h3>
                <p className="max-w-md text-neutral-100">{currentError}</p>
                <Button
                  intent="accent"
                  variant="outlined"
                  onClick={() => setRetry((attempt) => attempt + 1)}
                >
                  Try again
                </Button>
              </div>
            ) : !data?.data.length ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <SearchX aria-hidden="true" className="size-10 text-accent-300" />
                <h3 className="text-xl font-semibold text-primary-200">
                  No papers found
                </h3>
                <p className="text-neutral-100">
                  Try a different keyword or publication year range.
                </p>
                {(search || yearRange) && (
                  <Button
                    intent="accent"
                    variant="outlined"
                    onClick={() => {
                      setSearch("");
                      setYearRange(null);
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <div className={CATALOG_GRID}>
                {data.data.map((paper) => {
                  const canFindSimilar = canFindSimilarForPaper(paper);
                  return (
                    <CatalogCard
                      key={paper.id}
                      title={paper.title}
                      eyebrow={
                        paper.journalTitle ?? paper.sourceName ?? undefined
                      }
                      icon={
                        <BookOpen
                          aria-hidden="true"
                          className="size-8 text-accent-300"
                        />
                      }
                      badge={
                        paper.publicationYear !== null &&
                        paper.publicationYear > 0 ? (
                          <Badge size="md" variant="solid" intent="accent">
                            {paper.publicationYear}
                          </Badge>
                        ) : undefined
                      }
                      action={
                        <div className="@container mt-auto w-full">
                          <div className="grid grid-cols-1 gap-2 @[15rem]:grid-cols-2">
                            <Link
                              href={`/research?tab=papers&paper=${paper.id}`}
                              aria-label={`Show more about ${paper.title}`}
                              className={PAPER_CARD_ACTION_CLASSES}
                              onClick={(event) => {
                                if (
                                  !event.metaKey &&
                                  !event.ctrlKey &&
                                  !event.shiftKey &&
                                  !event.altKey &&
                                  event.button === 0
                                ) {
                                  event.preventDefault();
                                  navigate(paper.id);
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === " ") {
                                  event.preventDefault();
                                  navigate(paper.id);
                                }
                              }}
                            >
                              Show more
                            </Link>
                            {canFindSimilar ? (
                              <Link
                                href={`/research?tab=papers&paper=${paper.id}&similar=1`}
                                aria-label={`Find similar papers to ${paper.title}`}
                                className={PAPER_CARD_ACTION_CLASSES}
                                onClick={(event) => {
                                  if (
                                    !event.metaKey &&
                                    !event.ctrlKey &&
                                    !event.shiftKey &&
                                    !event.altKey &&
                                    event.button === 0
                                  ) {
                                    event.preventDefault();
                                    navigate(paper.id, { similar: true });
                                  }
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === " ") {
                                    event.preventDefault();
                                    navigate(paper.id, { similar: true });
                                  }
                                }}
                              >
                                <span>Find Similar</span>
                                <FileSearch
                                  aria-hidden="true"
                                  className="size-4 shrink-0"
                                />
                              </Link>
                            ) : (
                              <button
                                type="button"
                                disabled
                                aria-label={`Find similar papers to ${paper.title || "this paper"} (unavailable)`}
                                title="Paper title is required to find similar papers"
                                className={`${PAPER_CARD_ACTION_CLASSES} opacity-50 pointer-events-none cursor-default`}
                              >
                                <span>Find Similar</span>
                                <FileSearch
                                  aria-hidden="true"
                                  className="size-4 shrink-0"
                                />
                              </button>
                            )}
                          </div>
                        </div>
                      }
                    >
                      {paper.staff?.name && (
                        <p className="line-clamp-2 wrap-break-word text-accent-300">
                          {paper.staff.name}
                        </p>
                      )}
                      {paper.subtitle && (
                        <p className="line-clamp-2 wrap-break-word text-neutral-200">
                          {paper.subtitle}
                        </p>
                      )}
                      <CatalogSourceLink
                        url={paper.url}
                        label="Read paper"
                        title={paper.title}
                      />
                    </CatalogCard>
                  );
                })}
              </div>
            )}
          </div>

          {!showInitialSkeleton && !currentError && data && (
            <CatalogPagination
              label="Papers pagination"
              page={page}
              totalPages={data.pagination.totalPages}
              onPageChange={setPage}
              disabled={loading}
            />
          )}
        </CatalogLayout>

        <PapersExploreSection suggestedQuery={term} />
      </div>
    </ResearchCatalogSwap>
  );
}
