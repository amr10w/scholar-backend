"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import {
  Building2,
  Map as MapIcon,
  RotateCcw,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { CatalogCardsSkeleton } from "@/src/components/catalog/CatalogCard";
import CatalogPagination from "@/src/components/catalog/CatalogPagination";
import Button from "@/src/components/ui/Button/Button";
import FilterPill from "@/src/components/ui/FilterPill/FilterPill";
import { Input } from "@/src/components/ui/InputField/Input";
import { OptionList } from "@/src/components/ui/OptionList/OptionList";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import {
  buildCompaniesQuery,
  fetchCompanies,
  fetchCompanyFacets,
} from "../companies.api";
import { EMPTY_COMPANY_FILTERS } from "../jobs.constants";
import type {
  CompaniesResponse,
  CompanyFacets,
  CompanyFilters,
  CompanySummary,
} from "../jobs.type";
import CompanyCard from "./CompanyCard";
import CompanyDetailModal from "./CompanyDetailModal";
import CountryMapModal from "./CountryMapModal";

interface CompaniesPanelProps {
  filters: CompanyFilters;
  onFiltersChange: (next: CompanyFilters) => void;
}

export default function CompaniesPanel({
  filters,
  onFiltersChange,
}: CompaniesPanelProps) {
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanySummary | null>(
    null,
  );

  // Independent facets fetch (failure never blocks companies list)
  const [facetsRetry, setFacetsRetry] = useState(0);
  const [facetsState, setFacetsState] = useState<{
    data?: CompanyFacets;
    error?: string;
    loading: boolean;
  }>({ loading: true });

  useEffect(() => {
    const controller = new AbortController();
    fetchCompanyFacets(controller.signal)
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
                : "Couldn't load company filter options.",
            loading: false,
          });
        }
      });
    return () => controller.abort();
  }, [facetsRetry]);

  // Debounced companies list fetch
  const debouncedSearch = useDebouncedValue(filters.search, 300);
  const appliedFilters: CompanyFilters = {
    ...filters,
    search: debouncedSearch,
  };
  const query = buildCompaniesQuery(appliedFilters);
  const [listRetry, setListRetry] = useState(0);
  const requestKey = `${query}:${listRetry}`;
  const [listState, setListState] = useState<{
    key: string;
    data?: CompaniesResponse;
    error?: string;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    fetchCompanies(query, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setListState({ key: requestKey, data });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && !axios.isCancel(cause)) {
          setListState({
            key: requestKey,
            error:
              cause instanceof Error
                ? cause.message
                : "Something went wrong loading companies.",
          });
        }
      });
    return () => controller.abort();
  }, [query, requestKey]);

  const loading =
    listState?.key !== requestKey || filters.search !== debouncedSearch;
  const currentError = listState?.key === requestKey ? listState.error : undefined;
  // Keep previous results visible while refetching so filter changes never flash skeletons
  const data = listState?.data;
  const showInitialSkeleton = loading && !data;
  const isRefetching = loading && Boolean(data);
  const companies = data?.data ?? [];
  const pagination = data?.pagination;
  const facets = facetsState.data;

  const updateFilter = <K extends keyof CompanyFilters>(
    key: K,
    value: CompanyFilters[K],
  ) => {
    onFiltersChange({ ...filters, [key]: value, page: 1 });
  };

  const hasActiveFilters = Boolean(
    filters.search.trim() ||
      filters.countries.length > 0 ||
      filters.category ||
      filters.size,
  );

  const handleResetAll = () => {
    onFiltersChange({ ...EMPTY_COMPANY_FILTERS });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* Header Row */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-wide text-neutral-50 uppercase sm:text-3xl">
            Global Companies
          </h2>
          <p className="mt-1 text-sm text-neutral-200 sm:text-base">
            Directory of VLSI, embedded systems, and tech companies.
          </p>
        </div>

        <div
          role="status"
          className={`inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-accent-400/50 bg-accent-700/20 px-4 py-1.5 text-xs font-semibold text-accent-200 transition-opacity duration-150 sm:self-center ${isRefetching ? "opacity-70" : "opacity-100"}`}
        >
          <Building2 aria-hidden="true" className="size-3.5 shrink-0" />
          <span>
            {showInitialSkeleton
              ? "Loading companies…"
              : currentError
                ? "Companies unavailable"
                : `${pagination?.total ?? 0} ${(pagination?.total ?? 0) === 1 ? "Company" : "Companies"}`}
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-500/70 bg-overlay/5 p-3 lg:flex-row lg:items-center">
        {/* Shared Map Picker Trigger */}
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
            aria-label="Search companies"
            placeholder="Search name or industry..."
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            endAdornment={<Search aria-hidden="true" className="size-5" />}
          />
        </div>

        {/* Category (+ Add Category), Size & Reset */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterPill
            label={filters.category ? filters.category : "+ Add Category"}
          >
            <OptionList<string>
              inputType="radio"
              options={[
                { value: "", label: "All Categories" },
                ...(facets?.categories ?? []).map((cat) => ({
                  value: cat,
                  label: cat,
                })),
              ]}
              selected={[filters.category]}
              onToggle={(val) => updateFilter("category", val)}
            />
          </FilterPill>

          <FilterPill
            label={filters.size ? `Size: ${filters.size}` : "All Sizes"}
          >
            <OptionList<string>
              inputType="radio"
              options={[
                { value: "", label: "All Sizes" },
                ...(facets?.sizes ?? []).map((sz) => ({
                  value: sz,
                  label: sz,
                })),
              ]}
              selected={[filters.size]}
              onToggle={(val) => updateFilter("size", val)}
            />
          </FilterPill>

          <button
            type="button"
            onClick={handleResetAll}
            title={hasActiveFilters ? "Reset all filters" : "No active filters"}
            aria-label="Reset company filters"
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

      {facetsState.error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-danger-400/50 bg-danger-800/15 px-4 py-2.5 text-xs text-neutral-100"
        >
          <span>Couldn&apos;t load company filter options.</span>
          <button
            type="button"
            onClick={() => setFacetsRetry((v) => v + 1)}
            className="font-semibold text-accent-300 underline-offset-2 hover:underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Active Filter Chips */}
      {hasActiveFilters && (
        <div
          aria-label="Active company filters"
          className="flex flex-wrap items-center gap-2"
        >
          {filters.countries.map((country) => (
            <span
              key={`cc-${country}`}
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
          {filters.category && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-300/50 bg-primary-700/25 px-3 py-1 text-xs font-medium text-primary-100">
              Category: {filters.category}
              <button
                type="button"
                aria-label="Remove category filter"
                onClick={() => updateFilter("category", "")}
                className="rounded-full p-0.5 hover:text-danger-300 cursor-pointer"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          )}
          {filters.size && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-300/50 bg-primary-700/25 px-3 py-1 text-xs font-medium text-primary-100">
              Size: {filters.size}
              <button
                type="button"
                aria-label="Remove size filter"
                onClick={() => updateFilter("size", "")}
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

      {/* Companies Grid */}
      <section aria-label="Company results" aria-busy={loading}>
        {showInitialSkeleton ? (
          <CatalogCardsSkeleton count={6} />
        ) : currentError ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-4 rounded-3xl border border-danger-400/50 bg-overlay/5 py-16 text-center"
          >
            <h3 className="text-xl font-semibold text-danger-300">
              Couldn&apos;t load companies
            </h3>
            <p className="max-w-md text-sm text-neutral-100">{currentError}</p>
            <Button
              type="button"
              intent="accent"
              variant="outlined"
              onClick={() => setListRetry((v) => v + 1)}
            >
              Try again
            </Button>
          </div>
        ) : companies.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-neutral-500/60 bg-overlay/5 py-16 text-center">
            <SearchX aria-hidden="true" className="size-12 text-accent-300" />
            <h3 className="text-xl font-semibold text-primary-200">
              No companies found
            </h3>
            <p className="max-w-md text-sm text-neutral-200">
              No companies match your search or selected filters.
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
            <div className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {companies.map((company) => (
                <CompanyCard
                  key={company.id}
                  company={company}
                  onSelect={setSelectedCompany}
                />
              ))}
            </div>
            {pagination && pagination.totalPages > 1 && (
              <CatalogPagination
                label="Companies pagination"
                page={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={(page) => onFiltersChange({ ...filters, page })}
              />
            )}
          </div>
        )}
      </section>

      {/* Shared Map Picker Modal (Companies instance — isolated state & counts) */}
      <CountryMapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        selectedCountries={filters.countries}
        countryCounts={facets?.countryCounts ?? {}}
        availableCountries={facets?.countries ?? []}
        itemNoun="company"
        onConfirm={(countries) => updateFilter("countries", countries)}
      />

      {/* Company Details Modal */}
      <CompanyDetailModal
        company={selectedCompany}
        isOpen={Boolean(selectedCompany)}
        onClose={() => setSelectedCompany(null)}
      />
    </div>
  );
}
