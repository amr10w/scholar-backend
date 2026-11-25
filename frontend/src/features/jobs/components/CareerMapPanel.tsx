"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Briefcase,
  ChevronDown,
  Filter,
  Map as MapIcon,
  RotateCcw,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { CatalogCardsSkeleton } from "@/src/components/catalog/CatalogCard";
import CatalogPagination from "@/src/components/catalog/CatalogPagination";
import Button from "@/src/components/ui/Button/Button";
import FilterAccordion from "@/src/components/ui/FilterAccordion/FilterAccordion";
import FilterPill from "@/src/components/ui/FilterPill/FilterPill";
import { Input } from "@/src/components/ui/InputField/Input";
import { OptionList } from "@/src/components/ui/OptionList/OptionList";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import {
  buildJobsQuery,
  fetchJobFacets,
  fetchJobs,
  recordJobVisit,
} from "../jobs.api";
import { EMPTY_FILTERS, JOB_TYPES, SENIORITY_LEVELS } from "../jobs.constants";
import type {
  Job,
  JobFacets,
  JobFilters,
  JobsResponse,
} from "../jobs.type";
import { formatSourceLabel } from "../jobs.utils";
import CountryMapModal from "./CountryMapModal";
import JobCard from "./JobCard";
import JobDetailModal from "./JobDetailModal";

const SORT_OPTIONS: { value: JobFilters["sort"]; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title A–Z" },
];

interface CareerMapPanelProps {
  filters: JobFilters;
  onFiltersChange: (next: JobFilters) => void;
  brandSearch: string;
  onBrandSearchChange: (next: string) => void;
}

export default function CareerMapPanel({
  filters,
  onFiltersChange,
  brandSearch,
  onBrandSearchChange,
}: CareerMapPanelProps) {
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [disciplineSearch, setDisciplineSearch] = useState("");
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [visitOverrides, setVisitOverrides] = useState<Record<number, number>>(
    {},
  );
  const lastVisitedOpenRef = useRef<string | null>(null);

  // Independent facets loading (failure never blocks jobs list)
  const [facetsRetry, setFacetsRetry] = useState(0);
  const [facetsState, setFacetsState] = useState<{
    data?: JobFacets;
    error?: string;
    loading: boolean;
  }>({ loading: true });

  useEffect(() => {
    const controller = new AbortController();
    fetchJobFacets(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setFacetsState({ data, loading: false });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && !axios.isCancel(cause)) {
          setFacetsState({
            error:
              cause instanceof Error
                ? cause.message
                : "Couldn't load filter options.",
            loading: false,
          });
        }
      });
    return () => controller.abort();
  }, [facetsRetry]);

  // Debounced jobs list fetch
  const debouncedSearch = useDebouncedValue(filters.search, 300);
  const appliedFilters: JobFilters = { ...filters, search: debouncedSearch };
  const query = buildJobsQuery(appliedFilters);
  const [jobsRetry, setJobsRetry] = useState(0);
  const requestKey = `${query}:${jobsRetry}`;
  const [jobsState, setJobsState] = useState<{
    key: string;
    data?: JobsResponse;
    error?: string;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    fetchJobs(query, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setJobsState({ key: requestKey, data });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && !axios.isCancel(cause)) {
          setJobsState({
            key: requestKey,
            error:
              cause instanceof Error
                ? cause.message
                : "Something went wrong loading jobs.",
          });
        }
      });
    return () => controller.abort();
  }, [query, requestKey]);

  const loading =
    jobsState?.key !== requestKey || filters.search !== debouncedSearch;
  const currentError = jobsState?.key === requestKey ? jobsState.error : undefined;
  // Keep previous results visible while refetching so filter changes never flash skeletons or collapse height
  const data = jobsState?.data;
  const showInitialSkeleton = loading && !data;
  const isRefetching = loading && Boolean(data);
  const pagination = data?.pagination;
  const jobs = (data?.data ?? []).map((job) =>
    visitOverrides[job.id] !== undefined
      ? { ...job, numberVisited: visitOverrides[job.id] }
      : job,
  );

  const facets = facetsState.data;
  const allBrands = facets?.companies ?? [];
  const featuredBrands = allBrands.filter((b) => b.featured);
  const otherBrands = allBrands.filter((b) => !b.featured);
  const brandTerm = brandSearch.trim().toLowerCase();

  const filterAndSortBrands = (list: typeof allBrands) =>
    list
      .filter((b) => !brandTerm || b.name.toLowerCase().includes(brandTerm))
      .sort((a, b) => {
        const aSel = filters.companyIds.includes(a.id);
        const bSel = filters.companyIds.includes(b.id);
        if (aSel && !bSel) return -1;
        if (!aSel && bSel) return 1;
        return 0;
      });

  const visibleFeaturedBrands = filterAndSortBrands(featuredBrands);
  const visibleOtherBrands = filterAndSortBrands(otherBrands);

  const disciplineTerm = disciplineSearch.trim().toLowerCase();
  const disciplineOptions = (facets?.disciplines ?? []).filter(
    (d) => !disciplineTerm || d.toLowerCase().includes(disciplineTerm),
  );
  const sourceOptions = facets?.sources ?? ["linkedin", "wuzzuf"];

  const updateFilter = <K extends keyof JobFilters>(
    key: K,
    value: JobFilters[K],
  ) => {
    onFiltersChange({ ...filters, [key]: value, page: 1 });
  };

  const toggleCompanyId = (id: number) => {
    const next = filters.companyIds.includes(id)
      ? filters.companyIds.filter((c) => c !== id)
      : [...filters.companyIds, id];
    updateFilter("companyIds", next);
  };

  const hasActiveFilters = Boolean(
    filters.search.trim() ||
      filters.countries.length > 0 ||
      filters.disciplines.length > 0 ||
      filters.companyIds.length > 0 ||
      filters.source ||
      filters.type ||
      filters.seniority ||
      filters.sort !== "newest" ||
      brandSearch.trim(),
  );

  const activeSidebarCount =
    filters.companyIds.length +
    (filters.type ? 1 : 0) +
    (filters.seniority ? 1 : 0);

  const handleResetAll = () => {
    onFiltersChange({ ...EMPTY_FILTERS });
    onBrandSearchChange("");
    setDisciplineSearch("");
    setShowAllBrands(false);
  };

  const handleOpenJob = (job: Job) => {
    const currentCount = visitOverrides[job.id] ?? job.numberVisited;
    const optimisticCount = currentCount + 1;
    const openToken = `${job.id}:${Date.now()}`;

    setSelectedJob({ ...job, numberVisited: optimisticCount });

    if (lastVisitedOpenRef.current === openToken) return;
    lastVisitedOpenRef.current = openToken;

    setVisitOverrides((prev) => ({ ...prev, [job.id]: optimisticCount }));
    void recordJobVisit(job.id).then((serverCount) => {
      if (serverCount !== null) {
        setVisitOverrides((prev) => ({ ...prev, [job.id]: serverCount }));
        setSelectedJob((current) =>
          current && current.id === job.id
            ? { ...current, numberVisited: serverCount }
            : current,
        );
      }
    });
  };

  const brandNameById = (id: number) =>
    allBrands.find((b) => b.id === id)?.name ?? `Brand #${id}`;

  const renderSidebarContent = () => (
    <div className="flex flex-col gap-3">
      {facetsState.error && (
        <div
          role="alert"
          className="rounded-xl border border-danger-400/50 bg-danger-800/15 p-3 text-xs text-neutral-100"
        >
          <p className="font-medium text-danger-300">
            Couldn&apos;t load filter options.
          </p>
          <button
            type="button"
            onClick={() => setFacetsRetry((v) => v + 1)}
            className="mt-1.5 font-semibold text-accent-300 underline-offset-2 hover:underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* BRAND Sidebar Section */}
      <div className="rounded-2xl border border-neutral-500/70 bg-overlay/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold tracking-wider text-neutral-50 uppercase">
            Brand
          </h3>
          {filters.companyIds.length > 0 && (
            <button
              type="button"
              onClick={() => updateFilter("companyIds", [])}
              className="text-xs font-medium text-accent-300 hover:text-accent-200 cursor-pointer"
            >
              Clear ({filters.companyIds.length})
            </button>
          )}
        </div>

        <div className="relative mb-3">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-300"
          />
          <input
            type="search"
            aria-label="Search brands"
            placeholder="Search brands…"
            value={brandSearch}
            onChange={(event) => onBrandSearchChange(event.target.value)}
            className="w-full rounded-xl border border-neutral-500/70 bg-neutral-800/60 py-2 pr-3 pl-9 text-sm text-neutral-50 placeholder:text-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-200"
          />
        </div>

        {facetsState.loading ? (
          <div className="space-y-2" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="h-6 rounded bg-overlay/10 motion-safe:animate-pulse"
              />
            ))}
          </div>
        ) : (
          <>
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
              {visibleFeaturedBrands.map((brand) => {
                const checked = filters.companyIds.includes(brand.id);
                return (
                  <label
                    key={brand.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-neutral-100 transition-colors hover:bg-overlay/5"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCompanyId(brand.id)}
                      className="size-4 shrink-0 accent-accent-400"
                    />
                    <span className="truncate">{brand.name}</span>
                  </label>
                );
              })}

              {(showAllBrands || Boolean(brandTerm)) &&
                visibleOtherBrands.map((brand) => {
                  const checked = filters.companyIds.includes(brand.id);
                  return (
                    <label
                      key={brand.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-neutral-200 transition-colors hover:bg-overlay/5"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCompanyId(brand.id)}
                        className="size-4 shrink-0 accent-accent-400"
                      />
                      <span className="truncate">{brand.name}</span>
                    </label>
                  );
                })}

              {visibleFeaturedBrands.length === 0 &&
                visibleOtherBrands.length === 0 && (
                  <p className="py-3 text-center text-xs text-neutral-300">
                    No matching brands.
                  </p>
                )}
            </div>

            {otherBrands.length > 0 && !brandTerm && (
              <button
                type="button"
                onClick={() => setShowAllBrands((v) => !v)}
                className="mt-3 text-xs font-semibold text-primary-200 transition-colors hover:text-accent-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200 cursor-pointer"
              >
                {showAllBrands
                  ? "See Less"
                  : `See All (${allBrands.length})`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Preserved Current Repo Filters: Job Type & Seniority */}
      <div className="rounded-2xl border border-neutral-500/70 bg-overlay/5 p-3">
        <FilterAccordion
          label="Job type"
          activeCount={filters.type ? 1 : 0}
          onClear={() => updateFilter("type", "")}
        >
          <OptionList<JobFilters["type"]>
            inputType="radio"
            options={[
              { value: "", label: "All job types" },
              ...Object.entries(JOB_TYPES).map(([value, label]) => ({
                value: value as JobFilters["type"],
                label,
              })),
            ]}
            selected={[filters.type]}
            onToggle={(value) => updateFilter("type", value)}
          />
        </FilterAccordion>

        <FilterAccordion
          label="Seniority"
          activeCount={filters.seniority ? 1 : 0}
          onClear={() => updateFilter("seniority", "")}
        >
          <OptionList<JobFilters["seniority"]>
            inputType="radio"
            options={[
              { value: "", label: "All seniority levels" },
              ...Object.entries(SENIORITY_LEVELS).map(([value, label]) => ({
                value: value as JobFilters["seniority"],
                label,
              })),
            ]}
            selected={[filters.seniority]}
            onToggle={(value) => updateFilter("seniority", value)}
          />
        </FilterAccordion>
      </div>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* Header Row */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-wide text-neutral-50 uppercase sm:text-3xl">
            Career Explorer
          </h2>
          <p className="mt-1 text-sm text-neutral-200 sm:text-base">
            Discover your next career move across the global semiconductor and
            tech landscape.
          </p>
        </div>

        <div
          role="status"
          className={`inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-accent-400/50 bg-accent-700/20 px-4 py-1.5 text-xs font-semibold text-accent-200 transition-opacity duration-150 sm:self-center ${isRefetching ? "opacity-70" : "opacity-100"}`}
        >
          <Briefcase aria-hidden="true" className="size-3.5 shrink-0" />
          <span>
            {showInitialSkeleton
              ? "Loading openings…"
              : currentError
                ? "Openings unavailable"
                : `${pagination?.total ?? 0} ${(pagination?.total ?? 0) === 1 ? "Opening" : "Openings"}`}
          </span>
        </div>
      </div>

      {/* Top Filter Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-500/70 bg-overlay/5 p-3 lg:flex-row lg:items-center">
        {/* Map Picker Trigger */}
        <button
          type="button"
          onClick={() => setIsMapOpen(true)}
          className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200 cursor-pointer ${
            filters.countries.length > 0
              ? "border-accent-400 bg-accent-700/25 text-accent-200"
              : "border-neutral-500/80 bg-surface text-neutral-100 hover:border-primary-300"
          }`}
        >
          <MapIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="whitespace-nowrap">
            Select Countries ({filters.countries.length})
          </span>
        </button>

        {/* Search Input */}
        <div className="min-w-0 flex-1">
          <Input
            type="search"
            aria-label="Search jobs"
            placeholder="Search position, stack..."
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            endAdornment={<Search aria-hidden="true" className="size-5" />}
          />
        </div>

        {/* Source, Discipline, Sort & Reset */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterPill
            label={
              filters.source
                ? `Source: ${formatSourceLabel(filters.source)}`
                : "All Sources"
            }
          >
            <OptionList<string>
              inputType="radio"
              options={[
                { value: "", label: "All Sources" },
                ...sourceOptions.map((src) => ({
                  value: src,
                  label: formatSourceLabel(src),
                })),
              ]}
              selected={[filters.source]}
              onToggle={(val) => updateFilter("source", val)}
            />
          </FilterPill>

          <FilterPill
            label={
              filters.disciplines[0]
                ? filters.disciplines[0]
                : "All Disciplines"
            }
          >
            <div className="w-60 space-y-2">
              <input
                type="search"
                aria-label="Filter disciplines"
                placeholder="Search disciplines…"
                value={disciplineSearch}
                onChange={(event) => setDisciplineSearch(event.target.value)}
                className="w-full rounded-lg border border-neutral-500/70 bg-neutral-800/70 px-2.5 py-1.5 text-xs text-neutral-50 placeholder:text-neutral-300 focus-visible:outline-2 focus-visible:outline-accent-200"
              />
              <div className="max-h-56 overflow-y-auto">
                <OptionList<string>
                  inputType="radio"
                  options={[
                    { value: "", label: "All Disciplines" },
                    ...disciplineOptions.map((d) => ({ value: d, label: d })),
                  ]}
                  selected={[filters.disciplines[0] ?? ""]}
                  onToggle={(val) =>
                    updateFilter("disciplines", val ? [val] : [])
                  }
                />
              </div>
            </div>
          </FilterPill>

          <FilterPill
            label={`Sort: ${SORT_OPTIONS.find((o) => o.value === filters.sort)?.label}`}
          >
            <OptionList<JobFilters["sort"]>
              inputType="radio"
              options={SORT_OPTIONS}
              selected={[filters.sort]}
              onToggle={(val) => updateFilter("sort", val)}
            />
          </FilterPill>

          {/* Mobile Filters Drawer Trigger */}
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-neutral-500/80 bg-surface px-3.5 py-2 text-sm font-medium text-neutral-100 hover:border-primary-300 focus-visible:outline-2 focus-visible:outline-accent-200 lg:hidden cursor-pointer"
          >
            <Filter aria-hidden="true" className="size-4" />
            <span>
              Filters{activeSidebarCount > 0 ? ` (${activeSidebarCount})` : ""}
            </span>
          </button>

          {/* Reset All Button */}
          <button
            type="button"
            onClick={handleResetAll}
            title={hasActiveFilters ? "Reset all filters" : "No active filters"}
            aria-label="Reset all filters"
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200 cursor-pointer ${
              hasActiveFilters
                ? "border-danger-400/60 bg-danger-800/20 text-danger-300 hover:bg-danger-800/35"
                : "border-neutral-500/70 bg-surface text-neutral-300 hover:text-neutral-50"
            }`}
          >
            <RotateCcw aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>

      {/* Main Content: Sticky Desktop Sidebar + Jobs Grid */}
      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <aside
          aria-label="Job filters"
          className="hidden w-64 shrink-0 lg:sticky lg:top-28 lg:block"
        >
          {renderSidebarContent()}
        </aside>

        <section
          aria-label="Job results"
          aria-busy={loading}
          className="flex min-w-0 flex-1 flex-col gap-5 w-full"
        >
          {/* Active Filter Chips inside results column so the sticky sidebar never shifts vertically */}
          {hasActiveFilters && (
            <div
              aria-label="Active filters"
              className="flex flex-wrap items-center gap-2"
            >
              {filters.countries.map((country) => (
                <span
                  key={`c-${country}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent-400/50 bg-accent-700/20 px-3 py-1 text-xs font-medium text-accent-200"
                >
                  Country: {country}
                  <button
                    type="button"
                    aria-label={`Remove country ${country}`}
                    onClick={() =>
                      updateFilter(
                        "countries",
                        filters.countries.filter((c) => c !== country),
                      )
                    }
                    className="rounded-full p-0.5 hover:text-danger-300 cursor-pointer"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              ))}
              {filters.source && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-300/50 bg-primary-700/25 px-3 py-1 text-xs font-medium text-primary-100">
                  Source: {formatSourceLabel(filters.source)}
                  <button
                    type="button"
                    aria-label="Remove source filter"
                    onClick={() => updateFilter("source", "")}
                    className="rounded-full p-0.5 hover:text-danger-300 cursor-pointer"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              )}
              {filters.disciplines.map((d) => (
                <span
                  key={`d-${d}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary-300/50 bg-primary-700/25 px-3 py-1 text-xs font-medium text-primary-100"
                >
                  Discipline: {d}
                  <button
                    type="button"
                    aria-label={`Remove discipline ${d}`}
                    onClick={() => updateFilter("disciplines", [])}
                    className="rounded-full p-0.5 hover:text-danger-300 cursor-pointer"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              ))}
              {filters.companyIds.map((id) => (
                <span
                  key={`b-${id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent-400/50 bg-accent-700/20 px-3 py-1 text-xs font-medium text-accent-200"
                >
                  Brand: {brandNameById(id)}
                  <button
                    type="button"
                    aria-label={`Remove brand ${brandNameById(id)}`}
                    onClick={() => toggleCompanyId(id)}
                    className="rounded-full p-0.5 hover:text-danger-300 cursor-pointer"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              ))}
              {filters.type && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-300/50 bg-primary-700/25 px-3 py-1 text-xs font-medium text-primary-100">
                  Type: {JOB_TYPES[filters.type]}
                  <button
                    type="button"
                    aria-label="Remove job type filter"
                    onClick={() => updateFilter("type", "")}
                    className="rounded-full p-0.5 hover:text-danger-300 cursor-pointer"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              )}
              {filters.seniority && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-300/50 bg-primary-700/25 px-3 py-1 text-xs font-medium text-primary-100">
                  Seniority: {SENIORITY_LEVELS[filters.seniority]}
                  <button
                    type="button"
                    aria-label="Remove seniority filter"
                    onClick={() => updateFilter("seniority", "")}
                    className="rounded-full p-0.5 hover:text-danger-300 cursor-pointer"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={handleResetAll}
                className="text-xs font-semibold text-accent-300 underline-offset-2 hover:underline cursor-pointer"
              >
                Clear all
              </button>
            </div>
          )}

          {showInitialSkeleton ? (
            <CatalogCardsSkeleton count={6} />
          ) : currentError ? (
            <div
              role="alert"
              className="flex flex-col items-center gap-4 rounded-3xl border border-danger-400/50 bg-overlay/5 py-16 text-center"
            >
              <h3 className="text-xl font-semibold text-danger-300">
                Couldn&apos;t load jobs
              </h3>
              <p className="max-w-md text-sm text-neutral-100">{currentError}</p>
              <Button
                type="button"
                intent="accent"
                variant="outlined"
                onClick={() => setJobsRetry((v) => v + 1)}
              >
                Try again
              </Button>
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-3xl border border-neutral-500/60 bg-overlay/5 py-16 text-center">
              <SearchX aria-hidden="true" className="size-12 text-accent-300" />
              <h3 className="text-xl font-semibold text-primary-200">
                No jobs found
              </h3>
              <p className="max-w-md text-sm text-neutral-200">
                Try adjusting your filters or search query to explore more
                openings.
              </p>
              {hasActiveFilters && (
                <Button
                  type="button"
                  intent="accent"
                  variant="outlined"
                  onClick={handleResetAll}
                >
                  Reset filters
                </Button>
              )}
            </div>
          ) : (
            <div
              className={`flex flex-col gap-6 transition-opacity duration-150 ${isRefetching ? "opacity-60" : "opacity-100"}`}
            >
              <div className="grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {jobs.map((job) => (
                  <JobCard key={job.id} job={job} onSelect={handleOpenJob} />
                ))}
              </div>
              {pagination && pagination.totalPages > 1 && (
                <CatalogPagination
                  label="Jobs pagination"
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  onPageChange={(page) => onFiltersChange({ ...filters, page })}
                />
              )}
            </div>
          )}
        </section>
      </div>

      {/* Mobile Filters Drawer */}
      {isMobileDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-neutral-900/75 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileDrawerOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Job filters"
            className="flex max-h-[85dvh] w-full flex-col rounded-t-3xl border-t border-neutral-500 bg-surface p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-50">Filters</h3>
              <button
                type="button"
                aria-label="Close filters drawer"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="inline-flex size-9 items-center justify-center rounded-full border border-neutral-500/70 bg-overlay/5 text-neutral-200 cursor-pointer"
              >
                <ChevronDown aria-hidden="true" className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
              {renderSidebarContent()}
            </div>
          </div>
        </div>
      )}

      {/* Shared Map Picker Modal (Career Map instance) */}
      <CountryMapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        selectedCountries={filters.countries}
        countryCounts={facets?.countryCounts ?? {}}
        availableCountries={[...(facets?.countries ?? []), "Remote"]}
        itemNoun="opening"
        onConfirm={(countries) => updateFilter("countries", countries)}
      />

      {/* Job Details Modal */}
      <JobDetailModal
        job={selectedJob}
        isOpen={Boolean(selectedJob)}
        onClose={() => setSelectedJob(null)}
      />
    </div>
  );
}
