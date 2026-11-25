"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import CatalogLayout from "@/src/components/catalog/CatalogLayout";
import { CatalogCardsSkeleton } from "@/src/components/catalog/CatalogCard";
import CatalogPagination from "@/src/components/catalog/CatalogPagination";
import Button from "@/src/components/ui/Button/Button";
import CatalogFacetLoader from "@/src/components/catalog/CatalogFacetLoader";
import SearchableFacet, {
  textFacetOptions,
} from "@/src/components/ui/SearchableFacet/SearchableFacet";
import { Input } from "@/src/components/ui/InputField/Input";
import type { Paginated } from "@/src/lib/api-client";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import ResearcherGrid from "./ResearcherGrid";
import {
  fetchResearcherFacets,
  fetchResearchers,
  RESEARCHERS_PAGE_SIZE,
} from "./researcher.api";
import {
  EMPTY_RESEARCHER_FILTERS,
  hasActiveResearcherFilters,
  researcherFiltersKey,
  toResearcherSummary,
} from "./researcher.utils";
import type {
  AcademicResearcher,
  ResearcherFacets,
  ResearcherFilters,
} from "./researcher.type";

const fields = [
  { key: "topics", label: "Topics" },
  { key: "departments", label: "Research Fields" },
  { key: "universities", label: "Universities" },
] as const;

interface ResearcherResults {
  key: string;
  items: AcademicResearcher[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  error?: string;
}

const requestKey = (filterKey: string, page: number, attempt: number) =>
  JSON.stringify([filterKey, page, attempt]);

export function useResearcherListing(
  initialPage?: Paginated<AcademicResearcher> | null,
  initialError?: string,
) {
  const [filters, setFilters] = useState(EMPTY_RESEARCHER_FILTERS);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const applied = useDebouncedValue(filters, 300);
  const appliedKey = researcherFiltersKey(applied);
  const pending = researcherFiltersKey(filters) !== appliedKey;
  const key = requestKey(appliedKey, page, attempt);
  const pageSize = initialPage?.pagination.limit ?? RESEARCHERS_PAGE_SIZE;

  const [result, setResult] = useState<ResearcherResults | undefined>(() => {
    if (!initialPage && !initialError) return undefined;
    return {
      key: requestKey(researcherFiltersKey(EMPTY_RESEARCHER_FILTERS), 1, 0),
      items: initialPage?.data ?? [],
      page: initialPage?.pagination.page ?? 1,
      limit: initialPage?.pagination.limit ?? RESEARCHERS_PAGE_SIZE,
      total: initialPage?.pagination.total ?? 0,
      totalPages: initialPage?.pagination.totalPages ?? 0,
      error: initialError,
    };
  });
  const resultKey = result?.key;
  const loading = pending || resultKey !== key;

  useEffect(() => {
    if (pending || resultKey === key) return;
    const controller = new AbortController();
    const [firstName, ...lastName] = applied.search.trim().split(/\s+/);
    const names = lastName.length
      ? { firstName, lastName: lastName.join(" ") }
      : { researcher: firstName };

    fetchResearchers(
      {
        ...names,
        topics: applied.topics,
        departments: applied.departments,
        universities: applied.universities,
        page,
        limit: pageSize,
      },
      controller.signal,
    )
      .then(({ data, pagination }) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          items: data,
          page: pagination.page,
          limit: pagination.limit,
          total: pagination.total,
          totalPages: pagination.totalPages,
        });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          cause instanceof Error && cause.message
            ? cause.message
            : "Could not load researchers.";
        setResult({
          key,
          items: [],
          page,
          limit: pageSize,
          total: 0,
          totalPages: 0,
          error: message,
        });
      });
    return () => controller.abort();
  }, [applied, key, page, pageSize, pending, resultKey]);

  function update(next: ResearcherFilters) {
    if (researcherFiltersKey(next) !== researcherFiltersKey(filters))
      setPage(1);
    setFilters(next);
  }

  return {
    filters,
    page,
    result,
    loading,
    update,
    setPage,
    retry: () => setAttempt((value) => value + 1),
  };
}

export default function ResearcherListing({
  listing,
  onViewProfile,
}: {
  listing: ReturnType<typeof useResearcherListing>;
  onViewProfile: (id: number) => void;
}) {
  const { filters, page, result, loading, update, setPage, retry } = listing;
  const showInitialSkeleton = loading && !result;
  const isRefetching = loading && Boolean(result);
  const currentError = !loading ? result?.error : undefined;
  const total = result?.total ?? 0;
  const currentPage = result?.page ?? page;
  const currentLimit = result?.limit ?? RESEARCHERS_PAGE_SIZE;
  const first = total > 0 ? (currentPage - 1) * currentLimit + 1 : 0;
  const last =
    total > 0 ? Math.min(currentPage * currentLimit, total) : 0;
  const activeCount = fields.filter(({ key }) => filters[key].length).length;

  return (
    <CatalogLayout
      search={
        <Input
          type="search"
          aria-label="Search researchers"
          placeholder="Search by Researcher Name"
          value={filters.search}
          onChange={(event) =>
            update({ ...filters, search: event.target.value })
          }
          endAdornment={<Search aria-hidden="true" className="size-5" />}
        />
      }
      filters={
        <div className="flex flex-col gap-1">
          <CatalogFacetLoader<ResearcherFacets>
            catalog="researchers"
            load={fetchResearcherFacets}
          >
            {(facets) =>
              fields.map(({ key, label }) => (
                <SearchableFacet
                  key={key}
                  label={label}
                  options={textFacetOptions(facets[key])}
                  selected={filters[key]}
                  onChange={(values) => update({ ...filters, [key]: values })}
                />
              ))
            }
          </CatalogFacetLoader>
          {hasActiveResearcherFilters(filters) && (
            <Button
              type="button"
              variant="link"
              intent="accent"
              onClick={() => update(EMPTY_RESEARCHER_FILTERS)}
            >
              Clear all
            </Button>
          )}
        </div>
      }
      activeFilterCount={activeCount}
      resultsLabel="Researcher results"
    >
      <p role="status" className="text-sm text-accent-200">
        {showInitialSkeleton
          ? "Loading researchers…"
          : currentError
            ? "Researchers unavailable"
            : total > 0 && first <= last
              ? `Showing ${first}–${last} of ${total} researcher${total === 1 ? "" : "s"}`
              : `${total} researcher${total === 1 ? "" : "s"}`}
      </p>
      {showInitialSkeleton ? (
        <div aria-busy="true" aria-label="Loading researchers">
          <CatalogCardsSkeleton count={12} />
        </div>
      ) : currentError ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 py-16 text-center"
        >
          <h3 className="text-xl font-semibold text-danger-300">
            Researchers Are Unavailable
          </h3>
          <p className="text-neutral-100">{currentError}</p>
          <Button variant="outlined" intent="accent" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : result?.items.length ? (
        <div
          className={`flex flex-col gap-6 transition-opacity duration-150 ${isRefetching ? "opacity-60" : "opacity-100"}`}
          aria-busy={loading}
        >
          <ResearcherGrid
            researchers={result.items.map(toResearcherSummary)}
            onViewProfile={onViewProfile}
          />
          <CatalogPagination
            label="Researchers pagination"
            page={page}
            totalPages={result.totalPages}
            onPageChange={setPage}
            disabled={loading}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <h3 className="text-2xl font-semibold text-accent-300">
            {hasActiveResearcherFilters(filters)
              ? "No researchers found"
              : "Find What You're Looking For"}
          </h3>
          <p className="text-neutral-100">
            Search by name, topic, research field or university.
          </p>
        </div>
      )}
    </CatalogLayout>
  );
}
