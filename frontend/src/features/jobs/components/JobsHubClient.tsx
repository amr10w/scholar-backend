"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { EMPTY_COMPANY_FILTERS, EMPTY_FILTERS } from "../jobs.constants";
import type { CompanyFilters, JobFilters, JobsTabId } from "../jobs.type";
import CareerMapPanel from "./CareerMapPanel";
import CompaniesPanel from "./CompaniesPanel";

const JOBS_TABS: { id: JobsTabId; label: string }[] = [
  { id: "career-map", label: "Career Map" },
  { id: "companies", label: "Companies" },
];

export default function JobsHubClient({
  initialTab = "career-map",
}: {
  initialTab?: JobsTabId;
}) {
  const pathname = usePathname() || "/jobs";
  const searchParams = useSearchParams();
  const paramTab = searchParams?.get("tab");
  const activeTab: JobsTabId =
    paramTab === "companies"
      ? "companies"
      : paramTab === "career-map"
        ? "career-map"
        : initialTab;

  // Each page keeps its own isolated filter state & map selection across tab switches
  const [jobFilters, setJobFilters] = useState<JobFilters>(EMPTY_FILTERS);
  const [brandSearch, setBrandSearch] = useState("");
  const [companyFilters, setCompanyFilters] = useState<CompanyFilters>(
    EMPTY_COMPANY_FILTERS,
  );

  const handleTabChange = (tab: JobsTabId) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", tab);
    window.history.pushState(null, "", `${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      {/* Research-Hub-Style Tab Bar */}
      <nav
        aria-label="Jobs sections"
        className="relative z-10 flex w-full items-center gap-2 overflow-x-auto pb-1"
      >
        {JOBS_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => handleTabChange(tab.id)}
              className={`shrink-0 cursor-pointer rounded-xl px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200 sm:px-6 sm:text-base ${
                isActive
                  ? "bg-accent-700/30 text-accent-200"
                  : "text-neutral-200 hover:bg-overlay/5 hover:text-neutral-50"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === "companies" ? (
        <CompaniesPanel
          filters={companyFilters}
          onFiltersChange={setCompanyFilters}
        />
      ) : (
        <CareerMapPanel
          filters={jobFilters}
          onFiltersChange={setJobFilters}
          brandSearch={brandSearch}
          onBrandSearchChange={setBrandSearch}
        />
      )}
    </div>
  );
}
