"use client";

import { ChevronDown, RotateCcw } from "lucide-react";
import { Input } from "@/src/components/ui/InputField/Input";
import { EMPTY_RESEARCHER_FILTERS, hasActiveResearcherFilters } from "./researcher.utils";
import type { ResearcherFacets, ResearcherFilters } from "./researcher.type";

interface ResearcherToolbarProps {
  filters: ResearcherFilters;
  facets: ResearcherFacets;
  loadedCount: number;
  total: number | null;
  onChange: (filters: ResearcherFilters) => void;
}

interface FilterSelectProps {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

const FilterSelect = ({ id, label, value, options, onChange }: FilterSelectProps) => (
  <div className="relative min-w-0">
    <select
      id={id}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`appearance-none cursor-pointer max-w-full sm:max-w-40 truncate whitespace-nowrap rounded-full border bg-neutral-900 py-1.5 pl-3 pr-8 text-sm tracking-normal outline-none transition-colors duration-200 focus-visible:border-accent-300 ${
        value ? "border-accent-300 text-accent-200" : "border-neutral-400 text-neutral-200"
      }`}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
    <ChevronDown
      className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-200"
      aria-hidden="true"
    />
  </div>
);

const ResearcherToolbar = ({
  filters,
  facets,
  loadedCount,
  total,
  onChange,
}: ResearcherToolbarProps) => {
  const set = (patch: Partial<ResearcherFilters>) => onChange({ ...filters, ...patch });
  const active = hasActiveResearcherFilters(filters);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-3">
      <div className="w-full lg:w-72 lg:shrink-0">
        <Input
          id="researcher-search"
          type="search"
          size="sm"
          placeholder="Search by Researcher Name"
          aria-label="Search researchers"
          value={filters.search}
          onChange={(event) => set({ search: event.target.value })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <FilterSelect
          id="researcher-topic"
          label="Topics"
          value={filters.mainTopic}
          options={facets.topics}
          onChange={(mainTopic) => set({ mainTopic })}
        />
        <FilterSelect
          id="researcher-department"
          label="Research Fields"
          value={filters.department}
          options={facets.departments}
          onChange={(department) => set({ department })}
        />
        <FilterSelect
          id="researcher-university"
          label="Universities"
          value={filters.institutionName}
          options={facets.universities}
          onChange={(institutionName) => set({ institutionName })}
        />
        {active && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_RESEARCHER_FILTERS)}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-500 px-3 py-1.5 text-sm text-neutral-200 transition-colors duration-200 hover:border-accent-300 hover:text-accent-200 focus-visible:outline-none focus-visible:border-accent-300 cursor-pointer"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Reset
          </button>
        )}
      </div>

      {total !== null && (
        <p className="whitespace-nowrap text-sm text-neutral-200 lg:ml-auto" aria-live="polite">
          <span className="font-semibold text-neutral-50 tabular-nums">{loadedCount}</span> of{" "}
          <span className="font-semibold text-neutral-50 tabular-nums">{total}</span> researchers
        </p>
      )}
    </div>
  );
};

export default ResearcherToolbar;
